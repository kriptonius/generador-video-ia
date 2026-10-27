import { type FormEvent, type ReactNode, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  Clapperboard,
  Film,
  ImagePlus,
  Info,
  LoaderCircle,
  MoveUpRight,
  Play,
  RotateCcw,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import {
  getGetVideoPredictionStatusQueryKey,
  useCreateVideoPrediction,
  useGetVideoPredictionStatus,
} from '@workspace/api-client-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();
const MAX_IMAGE_BYTES = 250 * 1024;

type AttachedImage = { file: File; dataUrl: string; previewUrl: string };
type Prediction = { id: string; status: string; model: string; promptApplied: boolean };

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const candidate = error as { message?: string; error?: string; details?: string };
    return candidate.error || candidate.message || candidate.details || 'No se pudo completar la solicitud. Inténtalo de nuevo.';
  }
  return 'No se pudo completar la solicitud. Inténtalo de nuevo.';
}

async function compressImage(file: File): Promise<string> {
  const image = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const longest = Math.max(image.width, image.height);
  let scale = Math.min(1, 1800 / longest);

  for (let attempt = 0; attempt < 16; attempt += 1) {
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      image.close();
      throw new Error('No se pudo procesar esta imagen en el navegador.');
    }
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const quality = Math.max(0.42, 0.84 - attempt * 0.035);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= MAX_IMAGE_BYTES) {
      image.close();
      return dataUrl;
    }
    scale *= 0.82;
  }
  image.close();
  throw new Error('La imagen no se pudo reducir a menos de 250 KB. Prueba con otra imagen.');
}

function Home() {
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState<AttachedImage | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const createPrediction = useCreateVideoPrediction();
  const statusQuery = useGetVideoPredictionStatus(prediction?.id ?? '', {
    query: {
      queryKey: getGetVideoPredictionStatusQueryKey(prediction?.id ?? ''),
      enabled: Boolean(prediction?.id),
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status === 'starting' || status === 'processing' ? 2500 : false;
      },
    },
  });

  const status = statusQuery.data;
  const generating = createPrediction.isPending || status?.status === 'starting' || status?.status === 'processing';
  const isSucceeded = status?.status === 'succeeded' && Boolean(status.output);
  const isFailed = status?.status === 'failed' || status?.status === 'canceled' || status?.status === 'aborted';

  const onFileSelected = async (file?: File) => {
    if (!file) return;
    setUploadError('');
    if (!file.type.startsWith('image/')) {
      setUploadError('Elige un archivo de imagen para continuar.');
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await compressImage(file);
      setImage({ file, dataUrl, previewUrl: URL.createObjectURL(file) });
    } catch (error) {
      setUploadError(errorMessage(error));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const removeImage = () => {
    if (image) URL.revokeObjectURL(image.previewUrl);
    setImage(null);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!prompt.trim() || generating || uploading) return;
    setPrediction(null);
    createPrediction.mutate(
      { data: { prompt: prompt.trim(), ...(image ? { image: image.dataUrl } : {}) } },
      { onSuccess: (result) => setPrediction(result) },
    );
  };

  const outputName = status?.output?.split('/').pop()?.split('?')[0] || 'video-generado.mp4';

  return (
    <div className="min-h-[100dvh] text-foreground">
      <div className="studio-grid pointer-events-none fixed inset-0 opacity-50" aria-hidden="true" />
      <header className="relative z-10 border-b border-white/[0.07]">
        <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <a href="/" className="flex items-center gap-3 no-underline" aria-label="Generador de Video IA, inicio">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#d5f36a] text-[#171b13]">
              <Clapperboard size={19} strokeWidth={2.2} />
            </span>
            <span className="font-display text-[15px] font-semibold tracking-[-0.03em] text-[#eef1e9]">motion<span className="text-[#d5f36a]">/</span>lab</span>
          </a>
          <div className="flex items-center gap-2.5">
            <span className="hidden items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.13em] text-[#8d9587] sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-[#d5f36a]" /> Estudio de creación
            </span>
            <span className="h-8 w-px bg-white/[0.09]" />
            <span className="font-mono text-[10px] tracking-[0.08em] text-[#717a72]">BETA 01</span>
          </div>
        </div>
      </header>

      <main className="relative z-[1] mx-auto max-w-[1440px] px-5 pb-14 pt-9 sm:px-8 sm:pt-12 lg:px-12 lg:pb-20 lg:pt-[62px]">
        <section className="enter-up mb-8 flex flex-col justify-between gap-6 sm:mb-10 sm:flex-row sm:items-end">
          <div>
            <div className="mb-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.19em] text-[#9aa38f]">
              <span className="h-px w-6 bg-[#d5f36a]" /> Tu siguiente plano empieza aquí
            </div>
            <h1 className="font-display text-[clamp(2.35rem,5vw,4.15rem)] font-medium leading-[1.04] tracking-[-0.065em] text-[#f1f2eb]">
              Generador de Video IA
            </h1>
            <p className="mt-4 max-w-[560px] text-[14px] leading-6 text-[#91998f] sm:text-[15px]">
              Describe una escena. Dale movimiento a una imagen. Convierte una idea en un plano que puedas ver.
            </p>
          </div>
          <div className="flex items-center gap-2 pb-1 text-[11px] text-[#818a80]">
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#3b4435] text-[#d5f36a]"><Sparkles size={12} /></span>
            <span>Generación con modelos de video</span>
          </div>
        </section>

        <div className="enter-up-delay grid gap-5 lg:grid-cols-[minmax(370px,0.88fr)_minmax(0,1.12fr)] lg:gap-6">
          <section className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#161a22]/95 shadow-[0_24px_80px_rgba(0,0,0,.22)]" aria-labelledby="prompt-title">
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[10px] tracking-[0.12em] text-[#687168]">01</span>
                <h2 id="prompt-title" className="font-display text-[14px] font-semibold tracking-[-0.02em] text-[#e5e9df]">Construye tu plano</h2>
              </div>
              <span className="rounded-md border border-white/[0.08] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.11em] text-[#7f897b]">Idea → video</span>
            </div>

            <form onSubmit={submit} className="p-5 sm:p-6">
              <label htmlFor="video-prompt" className="mb-2.5 flex items-center justify-between text-[12px] font-medium text-[#c3c9bc]">
                <span>Describe lo que quieres ver</span>
                <span className="font-mono text-[10px] text-[#6e786e]">{prompt.length}/2000</span>
              </label>
              <textarea
                id="video-prompt"
                data-testid="input-video-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value.slice(0, 2000))}
                placeholder="Una bailarina solitaria bajo la lluvia de neón, la cámara gira lentamente mientras las gotas brillan en el aire…"
                maxLength={2000}
                rows={6}
                required
                className="min-h-[170px] w-full resize-y rounded-xl border border-[#30363b] bg-[#10141a] px-4 py-3.5 text-[13px] leading-[1.75] text-[#e4e8df] placeholder:text-[#626a67] focus:border-[#9ab148] focus:outline-none focus:ring-1 focus:ring-[#9ab148]/35"
              />
              <p className="mt-2 text-[10px] text-[#707a70]">Describe el sujeto, el movimiento de cámara, la luz y el ambiente.</p>

              <div className="mt-6">
                <div className="mb-2.5 flex items-center justify-between">
                  <label className="text-[12px] font-medium text-[#c3c9bc]" htmlFor="reference-image">Imagen de referencia <span className="font-normal text-[#707a70]">(opcional)</span></label>
                  {image && <span className="font-mono text-[9px] text-[#aab38c]">PREPARADA ≤ 250 KB</span>}
                </div>
                <input
                  ref={fileInput}
                  id="reference-image"
                  data-testid="input-reference-image"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => void onFileSelected(event.target.files?.[0])}
                />
                {image ? (
                  <div className="flex items-center gap-3 rounded-xl border border-[#343d31] bg-[#1b211b] p-2.5">
                    <img src={image.previewUrl} alt={`Vista previa de ${image.file.name}`} className="h-[58px] w-[76px] rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-[#d8ded2]">{image.file.name}</p>
                      <p className="mt-1 font-mono text-[9px] text-[#88927f]">Imagen comprimida y lista</p>
                    </div>
                    <button type="button" onClick={removeImage} aria-label="Quitar imagen de referencia" className="flex h-8 w-8 items-center justify-center rounded-lg text-[#929b8d] transition hover:bg-white/[0.07] hover:text-white" data-testid="button-remove-image"><X size={15} /></button>
                  </div>
                ) : (
                  <button
                    type="button"
                    data-testid="button-upload-image"
                    onClick={() => fileInput.current?.click()}
                    disabled={uploading}
                    className="group flex min-h-[78px] w-full items-center gap-3.5 rounded-xl border border-dashed border-[#414840] bg-[#11161a] px-4 text-left transition-colors hover:border-[#889b56] hover:bg-[#171d19] disabled:opacity-60"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#242b24] text-[#c9e77a]">
                      {uploading ? <LoaderCircle size={18} className="animate-spin" /> : <ImagePlus size={18} />}
                    </span>
                    <span className="flex-1">
                      <span className="block text-[12px] font-medium text-[#d7ddd2]">{uploading ? 'Optimizando imagen…' : 'Añade una imagen de referencia'}</span>
                      <span className="mt-1 block text-[10px] text-[#788177]">JPG, PNG o WebP. La comprimimos automáticamente.</span>
                    </span>
                    {!uploading && <Upload size={15} className="text-[#818a7d] transition group-hover:-translate-y-0.5" />}
                  </button>
                )}
                {uploadError && <p role="alert" className="mt-2 text-[11px] leading-5 text-[#f29b8c]">{uploadError}</p>}
              </div>

              <div className="mt-4 flex gap-2.5 rounded-lg border border-[#76623e]/30 bg-[#30281b]/45 px-3 py-2.5 text-[10px] leading-[1.55] text-[#b4a785]">
                <Info size={14} className="mt-0.5 shrink-0 text-[#d9aa61]" />
                <p>
                  {image
                    ? 'Con imagen, el modelo de imagen a video anima la imagen seleccionada; no aplica el texto del prompt.'
                    : 'Sin imagen, el modelo de texto a video genera la escena a partir de tu prompt.'}
                </p>
              </div>

              {(createPrediction.isError || statusQuery.isError || (isFailed && status?.error)) && (
                <div role="alert" data-testid="status-generation-error" className="mt-4 rounded-xl border border-[#713c3b]/60 bg-[#341f21]/75 px-4 py-3">
                  <p className="text-[11px] font-semibold text-[#f4a69b]">{isFailed ? `La generación terminó con estado: ${status?.status}` : 'No se pudo generar el video'}</p>
                  <p className="mt-1 break-words text-[11px] leading-5 text-[#d2a6a0]">
                    {status?.error || (createPrediction.isError ? errorMessage(createPrediction.error) : statusQuery.isError ? errorMessage(statusQuery.error) : '')}
                  </p>
                </div>
              )}

              <button
                type="submit"
                data-testid="button-generate-video"
                disabled={!prompt.trim() || generating || uploading}
                className="mt-5 flex h-[50px] w-full items-center justify-center gap-2.5 rounded-xl bg-[#d5f36a] px-5 text-[13px] font-bold text-[#1d2413] shadow-[0_8px_24px_rgba(182,217,84,.12)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#e0ff7c] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
              >
                {generating ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={15} />}
                {generating ? 'Generando tu video…' : 'Generar video'}
                {!generating && <MoveUpRight size={14} className="ml-1" />}
              </button>
              <p className="mt-3 text-center font-mono text-[9px] tracking-[0.04em] text-[#687168]">La generación puede tardar unos minutos</p>
            </form>
          </section>

          <section className="flex min-h-[470px] flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-[#14181f]/90 shadow-[0_24px_80px_rgba(0,0,0,.18)]" aria-labelledby="preview-title">
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[10px] tracking-[0.12em] text-[#687168]">02</span>
                <h2 id="preview-title" className="font-display text-[14px] font-semibold tracking-[-0.02em] text-[#e5e9df]">Vista previa</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${isSucceeded ? 'bg-[#d5f36a]' : generating ? 'animate-pulse bg-[#d9aa61]' : isFailed ? 'bg-[#ef8278]' : 'bg-[#5b645d]'}`} />
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#8b9388]">
                  {isSucceeded ? 'Listo' : generating ? 'Procesando' : isFailed ? 'Revisa el error' : 'En espera'}
                </span>
              </div>
            </div>

            <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4 sm:p-7">
              {isSucceeded && status?.output ? (
                <div className="w-full">
                  <div className="overflow-hidden rounded-xl border border-white/10 bg-black shadow-[0_24px_70px_rgba(0,0,0,.45)]">
                    <video data-testid="video-generated-output" src={status.output} controls playsInline className="aspect-video w-full bg-black" aria-label="Video generado" />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[11px] text-[#aeb7a7]"><Check size={14} className="text-[#d5f36a]" /> Tu plano está listo</div>
                    <a data-testid="link-download-video" href={status.output} download={outputName} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-[10px] font-medium text-[#d4dbce] transition hover:bg-white/[0.08]">
                      <ArrowDownToLine size={13} /> Abrir / descargar <ArrowUpRight size={11} />
                    </a>
                  </div>
                </div>
              ) : generating ? (
                <div className="w-full max-w-[590px]">
                  <div className="relative aspect-video overflow-hidden rounded-xl border border-white/[0.09] bg-[#0c1015]">
                    <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(ellipse at 50% 45%, rgba(193,226,99,.17), transparent 45%), linear-gradient(135deg, transparent 48%, rgba(255,255,255,.025) 49%, transparent 50%)' }} />
                    <div className="absolute inset-x-0 top-0 h-px overflow-hidden bg-white/[0.05]"><div className="progress-sweep h-full w-1/3 bg-[#d5f36a]" /></div>
                    <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                      <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#c8e667]/25 bg-[#c8e667]/[0.08] text-[#d5f36a]"><Film size={23} /></span>
                      <p className="font-display text-[16px] font-medium tracking-[-0.03em] text-[#e2e7dc]">Dando forma a tu idea</p>
                      <p className="mt-2 max-w-[320px] text-[11px] leading-5 text-[#7f8980]">El modelo está preparando cada fotograma. Esta vista se actualizará automáticamente.</p>
                      <div className="mt-5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.13em] text-[#aab78b]">
                        <LoaderCircle size={12} className="animate-spin" /> {status?.status || prediction?.status || 'starting'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between font-mono text-[9px] text-[#657066]">
                    <span>ID · {prediction?.id.slice(0, 14)}</span><span>Comprobando cada 2,5 s</span>
                  </div>
                </div>
              ) : isFailed ? (
                <div className="max-w-[390px] px-5 text-center">
                  <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#773f3c]/50 bg-[#3a2223]/60 text-[#e7887c]"><RotateCcw size={22} /></span>
                  <p className="font-display text-[17px] font-medium tracking-[-0.03em] text-[#e7e9e2]">Este plano no llegó a renderizarse</p>
                  <p className="mt-2 text-[12px] leading-5 text-[#8f9890]">Puedes ajustar la descripción o intentarlo de nuevo. El detalle del proveedor está en el panel de creación.</p>
                  <button type="button" onClick={() => { setPrediction(null); createPrediction.reset(); }} className="mt-5 inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-[11px] font-medium text-[#d5f36a] transition hover:bg-white/[0.05]"><RotateCcw size={13} /> Preparar otro intento</button>
                </div>
              ) : statusQuery.isError ? (
                <div className="max-w-[360px] px-5 text-center">
                  <p role="alert" className="font-display text-[16px] text-[#e7e9e2]">No se pudo consultar el estado</p>
                  <p className="mt-2 text-[12px] leading-5 text-[#91998f]">{errorMessage(statusQuery.error)}</p>
                  <button type="button" onClick={() => void statusQuery.refetch()} className="mt-4 rounded-lg border border-white/10 px-4 py-2 text-[11px] text-[#d5f36a] hover:bg-white/[0.05]">Reintentar consulta</button>
                </div>
              ) : (
                <div className="relative w-full max-w-[590px]">
                  <div className="relative aspect-video overflow-hidden rounded-xl border border-white/[0.08] bg-[#0d1116]">
                    <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(ellipse at 50% 50%, rgba(101,113,81,.19), transparent 48%), linear-gradient(135deg, transparent 49.8%, rgba(255,255,255,.045) 50%, transparent 50.2%)' }} />
                    <div className="absolute left-[18%] top-[19%] h-[62%] w-[64%] rounded-[50%] border border-white/[0.045]" />
                    <div className="absolute left-[29%] top-[29%] h-[42%] w-[42%] rounded-[50%] border border-white/[0.05]" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="flex h-[58px] w-[58px] items-center justify-center rounded-2xl border border-white/[0.09] bg-white/[0.025] text-[#a4ad9b]"><Play size={20} fill="currentColor" strokeWidth={1.5} /></span>
                      <span className="mt-4 font-mono text-[9px] uppercase tracking-[0.17em] text-[#869082]">El próximo fotograma es tuyo</span>
                    </div>
                    <span className="absolute bottom-3 left-3 rounded border border-white/[0.09] bg-black/30 px-2 py-1 font-mono text-[8px] tracking-[0.08em] text-[#7b8579]">16:9 · VIDEO IA</span>
                    <span className="absolute bottom-3 right-3 font-mono text-[8px] tracking-[0.08em] text-[#6c766c]">PREVIEW 01</span>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-[10px] text-[#748074]">
                    <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#596357]" /> Esperando tu prompt</span>
                    <span className="font-mono">MP4 · Alta calidad</span>
                  </div>
                </div>
              )}
            </div>
            {prediction && (
              <div className="border-t border-white/[0.07] px-5 py-3.5 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[9px] text-[#737d73]">
                  <span className="font-mono">PREDICCIÓN · {prediction.id}</span>
                  <span className="font-mono">{image ? 'IMAGEN A VIDEO' : 'TEXTO A VIDEO'} · {prediction.model}</span>
                </div>
              </div>
            )}
          </section>
        </div>

        <footer className="mt-8 flex flex-col gap-3 border-t border-white/[0.07] pt-5 text-[10px] text-[#667067] sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2"><span className="font-display font-semibold tracking-[-0.02em] text-[#899284]">motion/lab</span><span className="text-[#434b44]">/</span><span>Un plano a la vez.</span></p>
          <p className="font-mono tracking-[0.04em]">La imagen guía el movimiento. Las palabras dan forma a la escena.</p>
        </footer>
      </main>
    </div>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
