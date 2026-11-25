
import React, { useState, useRef, useEffect } from 'react';
import { Bus, ArrowRight, ShieldCheck, AlertCircle, Camera, Loader2, XCircle, CloudLightning, History, Fingerprint, BadgeCheck, ScanSearch } from 'lucide-react';
import { storageService } from '../services/storageService';
import { authService } from '../services/authService';
import { validateBiometricCapture, verifyBiometricMatch } from '../services/geminiService';
import { ShiftData } from '../types';

interface ShiftSetupProps {
  onSetupComplete: (data: ShiftData) => void;
}

const ShiftSetup: React.FC<ShiftSetupProps> = ({ onSetupComplete }) => {
  const [vehicleNo, setVehicleNo] = useState('');
  const [driverId, setDriverId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [selfie, setSelfie] = useState<string | null>(null);
  
  // Cloud Resume State
  const [cloudShift, setCloudShift] = useState<ShiftData | null>(null);
  const [checkingCloud, setCheckingCloud] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const estimateSharpness = (imageData: Uint8ClampedArray): number => {
    let edgeSum = 0;
    const stride = 4;
    const widthEstimate = Math.sqrt(imageData.length / stride);
    const step = Math.max(1, Math.floor(widthEstimate / 120));
    const limit = imageData.length - (stride * 3);

    for (let i = 0; i < limit; i += stride * step) {
      const g1 = (imageData[i] + imageData[i + 1] + imageData[i + 2]) / 3;
      const g2 = (imageData[i + stride] + imageData[i + stride + 1] + imageData[i + stride + 2]) / 3;
      edgeSum += Math.abs(g2 - g1);
    }

    return edgeSum;
  };

  useEffect(() => {
    const checkResume = async () => {
        const conductor = authService.getConductor();
        if (conductor) {
            const activeShift = await authService.checkCloudShift(conductor.employeeId);
            if (activeShift) {
                setCloudShift(activeShift);
            }
        }
        setCheckingCloud(false);
    };
    checkResume();
  }, []);

  const startCamera = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      setIsCapturing(true);
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 50);
    } catch (err) {
      setError("Camera access required for biometric verification.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsCapturing(false);
  };

  const captureSelfie = async () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx || !video.videoWidth || !video.videoHeight) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const shots: Array<{ dataUrl: string; quality: number }> = [];
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0);
        ctx.restore();

        let quality = 0;
        try {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          quality = estimateSharpness(imageData.data);
        } catch {
          quality = 0;
        }

        shots.push({
          dataUrl: canvas.toDataURL('image/jpeg', 0.92),
          quality
        });

        if (i < 3) await wait(70);
      }

      const best = shots.sort((a, b) => b.quality - a.quality)[0];
      if (best) {
        setSelfie(best.dataUrl);
      }
      stopCamera();
    }
  };

  const handleResume = async () => {
     if (!cloudShift || !selfie) return;
     // Re-use logic for submission but with cloud data
     await processShiftStart(cloudShift.vehicleNo, cloudShift.driverId, true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await processShiftStart(vehicleNo, driverId, false);
  };

  const processShiftStart = async (vNo: string, dId: string, isResume: boolean) => {
    const conductor = authService.getConductor();
    if (!conductor) return;

    if (!selfie) {
      setError("Biometric selfie is required to verify identity.");
      return;
    }

    // Task 7.2: Guard — fall back to cloudShift values if vNo/dId are empty
    const resolvedVNo = vNo || cloudShift?.vehicleNo || '';
    const resolvedDId = dId || cloudShift?.driverId || '';

    if (!resolvedVNo || !resolvedDId) {
      setError("Vehicle number and driver ID are required.");
      return;
    }

    setLoading(true);
    setError('');

    try {
      const captureAssessment = await validateBiometricCapture(selfie, 'CONDUCTOR');
      if (!captureAssessment.valid) {
        setError(captureAssessment.reason || "Invalid photo uploaded. Please retake a clear live selfie.");
        setLoading(false);
        return;
      }

      // If conductor has a master photo, verify biometric match
      if (conductor.masterPhoto) {
        const result = await verifyBiometricMatch(conductor.masterPhoto, selfie, 'CONDUCTOR');
        if (!result.match) {
          const detail =
            result.reason ||
            `low confidence ${result.confidence.toFixed(2)} < ${result.threshold.toFixed(2)}`;
          setError(`Biometric mismatch: ${detail}. Cannot resume/start shift.`);
          setLoading(false);
          return;
        }
      } else {
        // First shift? Store this as the master photo
        conductor.masterPhoto = selfie;
        await authService.updateConductor(conductor);
      }

      const data: ShiftData = { 
        vehicleNo: resolvedVNo.toUpperCase().replace(/\s+/g, ''), 
        driverId: resolvedDId.toUpperCase().trim(),
        startTime: isResume && cloudShift ? cloudShift.startTime : Date.now(),
        conductorId: conductor.employeeId,
        conductorSelfie: selfie
      };
      
      storageService.setShift(data);
      onSetupComplete(data);
    } catch (err: any) {
      console.error('ShiftSetup error:', err);
      setError(`Identity verification failed. Please retry. Details: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center p-6 relative overflow-hidden font-sans">
      <div className="w-full max-w-sm space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-1000">
        <div className="text-center space-y-4">
          <div className="p-6 rounded-[2.5rem] bg-white shadow-2xl border-4 border-brand-yellow inline-block relative">
            <Bus size={48} className="text-brand-red" />
          </div>
          <h2 className="text-2xl font-black text-brand-dark uppercase tracking-tighter">Shift Control</h2>
        </div>

        <div className="bg-brand-dark text-white p-6 rounded-[2.5rem] shadow-xl relative overflow-hidden border border-brand-yellow/20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,214,0,0.18),transparent_34%),linear-gradient(145deg,rgba(255,255,255,0.07),transparent_55%)]" />
          <div className="relative z-10">
            <p className="text-[9px] font-black text-brand-yellow uppercase tracking-[0.22em]">Readiness Check</p>
            <h3 className="text-lg font-black tracking-tight mt-1">Open a conductor shift before live ticket issuance</h3>
            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="rounded-[1.2rem] border border-white/10 bg-white/8 px-3 py-3 text-center">
                <BadgeCheck size={16} className="mx-auto text-brand-yellow" />
                <p className="text-[8px] font-black uppercase tracking-[0.16em] mt-2 text-white/70">Vehicle</p>
              </div>
              <div className="rounded-[1.2rem] border border-white/10 bg-white/8 px-3 py-3 text-center">
                <ScanSearch size={16} className="mx-auto text-brand-yellow" />
                <p className="text-[8px] font-black uppercase tracking-[0.16em] mt-2 text-white/70">Driver</p>
              </div>
              <div className="rounded-[1.2rem] border border-white/10 bg-white/8 px-3 py-3 text-center">
                <Fingerprint size={16} className="mx-auto text-brand-yellow" />
                <p className="text-[8px] font-black uppercase tracking-[0.16em] mt-2 text-white/70">Biometric</p>
              </div>
            </div>
          </div>
        </div>

        {/* RESUME SHIFT CARD */}
        {cloudShift && !checkingCloud && (
             <div className="bg-brand-dark text-white p-6 rounded-[2.5rem] shadow-xl relative overflow-hidden animate-in slide-in-from-top duration-500 border border-brand-yellow/20">
                <div className="relative z-10">
                   <div className="flex justify-between items-start mb-4">
                      <div>
                          <p className="text-[9px] font-black text-brand-yellow uppercase tracking-widest flex items-center gap-2">
                             <CloudLightning size={12} className="animate-pulse" /> Active Cloud Session
                          </p>
                          <h3 className="text-2xl font-black mt-1 italic tracking-tighter">{cloudShift.vehicleNo}</h3>
                      </div>
                      <div className="text-right">
                          <p className="text-[8px] font-bold text-gray-400 uppercase">Started</p>
                          <p className="text-xs font-mono font-bold">{new Date(cloudShift.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                      </div>
                   </div>
                   
                   {!selfie ? (
                      <button onClick={startCamera} className="w-full bg-white text-brand-dark py-3 rounded-2xl font-black text-[10px] uppercase flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors">
                        <Camera size={14} /> Verify & Resume
                      </button>
                   ) : (
                      <button onClick={handleResume} disabled={loading} className="w-full bg-brand-green text-white py-3 rounded-2xl font-black text-[10px] uppercase flex items-center justify-center gap-2 hover:bg-green-600 transition-colors">
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Confirm Resume
                      </button>
                   )}
                </div>
                {/* Decor */}
                <div className="absolute -bottom-6 -right-6 text-white/5 rotate-12"><History size={100} /></div>
             </div>
        )}

        {/* OR DIVIDER */}
        {cloudShift && <div className="text-center text-[10px] font-black text-gray-300 uppercase tracking-widest">- OR START NEW -</div>}

        <form onSubmit={handleSubmit} className="bg-white p-8 rounded-[3rem] shadow-2xl border border-gray-100 space-y-6">
          <div className="rounded-[1.75rem] bg-brand-cream border border-black/5 p-4">
            <p className="text-[8px] font-black uppercase tracking-[0.18em] text-brand-red">Why this step matters</p>
            <p className="text-[11px] font-bold text-brand-dark leading-relaxed mt-2">The shift record ties every AI scan, ticket decision, and audit event to the active conductor, vehicle, and duty window.</p>
          </div>
          {!isCapturing && !selfie ? (
            <div className="space-y-4">
              <input 
                type="text" placeholder="VEHICLE NO (e.g. AP39Z1234)" required={!cloudShift}
                value={vehicleNo} onChange={e => setVehicleNo(e.target.value)}
                className="w-full bg-gray-50 border-2 border-transparent focus:border-brand-yellow rounded-2xl py-4 px-6 text-[11px] font-black tracking-widest uppercase"
              />
              <input 
                type="text" placeholder="DRIVER EMPLOYEE ID" required={!cloudShift}
                value={driverId} onChange={e => setDriverId(e.target.value)}
                className="w-full bg-gray-50 border-2 border-transparent focus:border-brand-yellow rounded-2xl py-4 px-6 text-[11px] font-black tracking-widest uppercase"
              />
              <button 
                type="button" onClick={startCamera}
                className="w-full bg-brand-dark text-white font-black py-4 rounded-2xl flex items-center justify-center gap-3"
              >
                <Camera size={18} /> Take Verification Selfie
              </button>
            </div>
          ) : isCapturing ? (
            <div className="space-y-4">
              <div className="aspect-square w-full relative rounded-3xl overflow-hidden border-4 border-brand-yellow bg-black">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={captureSelfie} className="flex-1 bg-brand-green text-white font-black py-4 rounded-2xl uppercase">Capture</button>
                <button type="button" onClick={stopCamera} className="px-4 bg-gray-100 rounded-2xl"><XCircle /></button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="aspect-square w-full rounded-3xl overflow-hidden border-4 border-brand-green shadow-xl relative">
                <img src={selfie!} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent flex items-end justify-center pb-4">
                  <p className="text-[10px] text-white font-black uppercase tracking-widest">Biometric Identity Captured</p>
                </div>
              </div>
              {!cloudShift && <button type="button" onClick={() => setSelfie(null)} className="w-full text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Retake Selfie</button>}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-rose-50 text-brand-red rounded-xl animate-in zoom-in">
              <AlertCircle size={14} className="shrink-0" />
              <p className="text-[9px] font-black uppercase">{error}</p>
            </div>
          )}

          {/* Only show Start Shift button if we are NOT in the middle of a resume flow that used the camera */}
          {!cloudShift && (
              <button 
                type="submit" disabled={loading || isCapturing}
                className="w-full bg-brand-red text-white font-black py-5 rounded-2xl shadow-xl flex items-center justify-center gap-3 uppercase disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                <span>{loading ? 'Verifying Identity...' : 'Start New Shift'}</span>
              </button>
          )}
        </form>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default ShiftSetup;
