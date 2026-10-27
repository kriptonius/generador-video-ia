import { Router, type IRouter } from "express";
import {
  CreateVideoPredictionBody,
  CreateVideoPredictionResponse,
  GetVideoPredictionStatusParams,
  GetVideoPredictionStatusResponse,
} from "@workspace/api-zod";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { Readable } from "node:stream";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const connectors = new ReplitConnectors();

const MAX_IMAGE_DATA_URL_BYTES = 256 * 1024;
const IMAGE_DATA_URL_PATTERN =
  /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const predictionStatuses = [
  "starting",
  "processing",
  "succeeded",
  "failed",
  "canceled",
  "aborted",
] as const;

function isValidPredictionId(id: string): boolean {
  return /^[A-Za-z0-9-]{1,128}$/.test(id);
}

type ReplicatePrediction = {
  id?: unknown;
  status?: unknown;
  output?: unknown;
  error?: unknown;
};

function getErrorMessage(payload: unknown): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.detail === "string") return record.detail;
    if (typeof record.error === "string") return record.error;
  }
  return "Replicate no pudo procesar la solicitud.";
}

function getOutputUrl(output: unknown): string | null {
  const candidate =
    typeof output === "string"
      ? output
      : Array.isArray(output)
        ? output.find((item): item is string => typeof item === "string")
        : null;

  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

router.post("/generate", async (req, res) => {
  const parsedBody = CreateVideoPredictionBody.safeParse(req.body);

  if (!parsedBody.success) {
    res.status(400).json({ error: "Escribe un prompt para generar el video." });
    return;
  }

  const prompt = parsedBody.data.prompt.trim();
  const image = parsedBody.data.image?.trim();

  if (!prompt) {
    res.status(400).json({ error: "El prompt no puede estar vacío." });
    return;
  }

  if (image) {
    if (!IMAGE_DATA_URL_PATTERN.test(image)) {
      res.status(400).json({
        error: "La imagen debe estar en formato PNG, JPEG o WebP.",
      });
      return;
    }

    if (Buffer.byteLength(image, "utf8") > MAX_IMAGE_DATA_URL_BYTES) {
      res.status(413).json({
        error: "La imagen debe ocupar como máximo 256 KB.",
      });
      return;
    }
  }

  const model = image
    ? "stability-ai/stable-video-diffusion"
    : "lucataco/animate-diff";
  const input = image
    ? {
        input_image: image,
        video_length: "14_frames_with_svd",
        frames_per_second: 6,
        sizing_strategy: "maintain_aspect_ratio",
        motion_bucket_id: 127,
      }
    : {
        prompt,
        steps: 25,
        guidance_scale: 7.5,
        seed: 0,
      };

  try {
    const upstream = await connectors.proxy(
      "replicate",
      `/v1/models/${model}/predictions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      },
    );

    const prediction = (await upstream.json().catch(() => null)) as
      | ReplicatePrediction
      | null;

    if (!upstream.ok || !prediction || typeof prediction.id !== "string") {
      logger.warn(
        { statusCode: upstream.status, model },
        "Replicate rejected video generation request",
      );
      res.status(502).json({
        error: getErrorMessage(prediction),
      });
      return;
    }

    const response = CreateVideoPredictionResponse.parse({
      id: prediction.id,
      status:
        typeof prediction.status === "string"
          ? prediction.status
          : "starting",
      model,
      promptApplied: !image,
    });

    res.status(202).json(response);
  } catch (error) {
    logger.error({ err: error, model }, "Replicate prediction request failed");
    res.status(502).json({
      error: "No se pudo conectar con Replicate. Inténtalo de nuevo.",
    });
  }
});

router.get("/status/:id", async (req, res) => {
  const parsedParams = GetVideoPredictionStatusParams.safeParse(req.params);

  if (!parsedParams.success || !isValidPredictionId(parsedParams.data.id)) {
    res.status(400).json({ error: "El identificador de predicción no es válido." });
    return;
  }

  const id = parsedParams.data.id;

  try {
    const upstream = await connectors.proxy(
      "replicate",
      `/v1/predictions/${encodeURIComponent(id)}`,
      { method: "GET" },
    );
    const prediction = (await upstream.json().catch(() => null)) as
      | ReplicatePrediction
      | null;

    if (upstream.status === 404) {
      res.status(404).json({ error: "No se encontró esta generación." });
      return;
    }

    if (
      !upstream.ok ||
      !prediction ||
      typeof prediction.id !== "string" ||
      typeof prediction.status !== "string"
    ) {
      logger.warn(
        { statusCode: upstream.status, predictionId: id },
        "Replicate status request failed",
      );
      res.status(502).json({
        error: getErrorMessage(prediction),
      });
      return;
    }

    if (!predictionStatuses.includes(prediction.status as (typeof predictionStatuses)[number])) {
      res.status(502).json({
        error: "Replicate devolvió un estado de generación desconocido.",
      });
      return;
    }

    const outputUrl =
      prediction.status === "succeeded"
        ? getOutputUrl(prediction.output)
        : null;

    if (prediction.status === "succeeded" && !outputUrl) {
      res.status(502).json({
        error: "Replicate terminó la generación, pero no devolvió un video reproducible.",
      });
      return;
    }

    const result = GetVideoPredictionStatusResponse.parse({
      id: prediction.id,
      status: prediction.status,
      output: outputUrl ? `/api/video/${encodeURIComponent(id)}` : null,
      error: typeof prediction.error === "string"
        ? prediction.error
        : prediction.error
          ? JSON.stringify(prediction.error)
          : null,
    });

    res.json(result);
  } catch (error) {
    logger.error(
      { err: error, predictionId: id },
      "Replicate status request failed",
    );
    res.status(502).json({
      error: "No se pudo consultar el estado en Replicate.",
    });
  }
});

router.get("/video/:id", async (req, res) => {
  const parsedParams = GetVideoPredictionStatusParams.safeParse(req.params);

  if (!parsedParams.success || !isValidPredictionId(parsedParams.data.id)) {
    res.status(400).json({ error: "El identificador de predicción no es válido." });
    return;
  }

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    res.status(503).json({
      error: "Falta configurar REPLICATE_API_TOKEN para transmitir el video.",
    });
    return;
  }

  const id = parsedParams.data.id;

  try {
    const predictionResponse = await connectors.proxy(
      "replicate",
      `/v1/predictions/${encodeURIComponent(id)}`,
      { method: "GET" },
    );
    const prediction = (await predictionResponse.json().catch(() => null)) as
      | ReplicatePrediction
      | null;

    if (predictionResponse.status === 404) {
      res.status(404).json({ error: "No se encontró esta generación." });
      return;
    }

    if (
      !predictionResponse.ok ||
      !prediction ||
      typeof prediction.status !== "string"
    ) {
      logger.warn(
        { statusCode: predictionResponse.status, predictionId: id },
        "Replicate video lookup failed",
      );
      res.status(502).json({ error: getErrorMessage(prediction) });
      return;
    }

    if (prediction.status !== "succeeded") {
      res.status(409).json({ error: "El video todavía no está listo." });
      return;
    }

    const outputUrl = getOutputUrl(prediction.output);
    if (!outputUrl) {
      res.status(502).json({
        error: "Replicate no devolvió una URL de video válida.",
      });
      return;
    }

    const outputHost = new URL(outputUrl).hostname.toLowerCase();
    if (
      outputHost !== "replicate.delivery" &&
      !outputHost.endsWith(".replicate.delivery")
    ) {
      res.status(502).json({
        error: "Replicate devolvió un dominio de video no permitido.",
      });
      return;
    }

    const mediaHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    const range = req.headers.range;
    if (range && /^bytes=\d*-\d*$/.test(range) && range.length <= 100) {
      mediaHeaders.Range = range;
    }

    const mediaResponse = await fetch(outputUrl, { headers: mediaHeaders });
    if (!mediaResponse.ok || !mediaResponse.body) {
      logger.warn(
        { statusCode: mediaResponse.status, predictionId: id },
        "Replicate video download failed",
      );
      res.status(502).json({
        error: "No se pudo descargar el video generado desde Replicate.",
      });
      return;
    }

    res.status(mediaResponse.status);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `inline; filename="video-${id}.mp4"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    for (const headerName of [
      "accept-ranges",
      "content-length",
      "content-range",
    ]) {
      const value = mediaResponse.headers.get(headerName);
      if (value) res.setHeader(headerName, value);
    }

    const mediaStream = Readable.fromWeb(
      mediaResponse.body as import("node:stream/web").ReadableStream,
    );
    mediaStream.on("error", (error) => {
      logger.error({ err: error, predictionId: id }, "Video stream interrupted");
      if (!res.headersSent) res.status(502).end();
      else res.destroy(error);
    });
    mediaStream.pipe(res);
  } catch (error) {
    logger.error({ err: error, predictionId: id }, "Replicate video stream failed");
    if (!res.headersSent) {
      res.status(502).json({
        error: "No se pudo transmitir el video generado.",
      });
    } else {
      res.destroy(error instanceof Error ? error : undefined);
    }
  }
});

export default router;
