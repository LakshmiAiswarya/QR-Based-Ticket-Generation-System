
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Bus, IndianRupee, MapPin, BadgeCheck, UserCheck, Download, Printer, UserCircle, ArrowRight, Heart, ShieldCheck, AlertCircle, Share2, Loader2, UserRound, Navigation } from 'lucide-react';
import { AadharData } from '../types';
// Task 19.2: Import QRCode from qrcode.react
import { QRCodeSVG } from 'qrcode.react';

declare global {
  interface Window {
    html2canvas?: (
      element: HTMLElement,
      options?: {
        scale?: number;
        useCORS?: boolean;
        backgroundColor?: string;
      }
    ) => Promise<HTMLCanvasElement>;
  }
}

interface TicketProps {
  data: AadharData;
  onReset: () => void;
}

const Ticket: React.FC<TicketProps> = ({ data, onReset }) => {
  const [isPrinting, setIsPrinting] = useState(true);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const ticketRef = useRef<HTMLDivElement>(null);
  
  const ticketId = data.id || `RTC-${Math.floor(100000 + Math.random() * 900000)}`;
  const timestamp = data.timestamp ? new Date(data.timestamp) : new Date();
  const today = timestamp.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = timestamp.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  const { origin, destination } = useMemo(() => {
    if (!data.route) return { origin: "START", destination: "END" };
    const parts = data.route.split(" - ");
    return { origin: parts[0]?.trim() || "AP", destination: parts[1]?.trim() || "RTC" };
  }, [data.route]);

  useEffect(() => {
    const timer = setTimeout(() => setIsPrinting(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  const isFree = data.gender === 'F' && data.isEligible;
  const verificationLabel = data.biometricConfidence && data.biometricConfidence > 0
    ? (data.mlTrustScore !== undefined ? 'AADHAAR + FACE MATCH + ML' : 'AADHAAR + FACE MATCH')
    : (data.mlTrustScore !== undefined ? 'AADHAAR + ML SCREEN' : 'AADHAAR VERIFIED');
  const verificationScore = Math.round((data.biometricConfidence || 0) * 100);
  const mlTrustScore = typeof data.mlTrustScore === 'number'
    ? Math.round(data.mlTrustScore * 100)
    : null;

  const handleDownload = async () => {
    if (!ticketRef.current || isProcessingAction) return;
    setIsProcessingAction(true);
    try {
      if (!window.html2canvas) {
        window.print();
        return;
      }

      const canvas = await window.html2canvas(ticketRef.current, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#FAF9F6'
      });
      const link = document.createElement('a');
      link.download = `Ticket_${ticketId}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) { console.error(err); } finally { setIsProcessingAction(false); }
  };

  const handlePrint = () => window.print();

  if (isPrinting) {
    return (
      <div className="p-12 flex flex-col items-center justify-center min-h-[400px] gap-8 animate-in fade-in duration-700">
        <div className="w-20 h-20 border-8 border-brand-yellow/20 border-t-brand-red rounded-full animate-spin"></div>
        <p className="text-sm font-black text-brand-dark uppercase tracking-widest text-center">Finalizing Transaction...</p>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col items-center animate-in slide-in-from-bottom-12 duration-700 max-w-sm mx-auto w-full font-sans">
      <div ref={ticketRef} className="bg-brand-cream rounded-[2.5rem] border-2 border-gray-200 shadow-2xl relative w-full flex flex-col overflow-hidden border-b-8 border-b-gray-300">
        <div className={`${isFree ? 'bg-brand-red' : 'bg-brand-dark'} p-5 text-white z-10 shadow-lg relative`}>
          <div className="flex justify-between items-start relative z-10">
            <div className="flex items-center gap-3">
              <div className="bg-white p-1 rounded-xl shadow-xl border border-brand-yellow w-12 h-12 flex items-center justify-center">
                <Bus size={32} className="text-brand-red" />
              </div>
              <div>
                <p className="text-[7px] font-black uppercase tracking-widest opacity-80">AP State RTC</p>
                <h3 className="font-black text-lg tracking-tighter uppercase italic">{isFree ? 'Stree Shakti Pass' : 'Transit Ticket'}</h3>
              </div>
            </div>
            {data.passengerPhoto && (
              <div className="w-14 h-14 rounded-2xl border-2 border-white/40 overflow-hidden shadow-2xl">
                <img src={data.passengerPhoto} className="w-full h-full object-cover" />
              </div>
            )}
          </div>
        </div>

        <div className="p-6 space-y-4 z-10">
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white p-3 rounded-[1.6rem] border border-gray-100 shadow-sm">
              <p className="text-[6px] font-black text-gray-400 uppercase tracking-[0.18em]">Verification</p>
              <p className="text-[10px] font-black text-brand-dark mt-2 leading-tight">{verificationLabel}</p>
            </div>
            <div className="bg-white p-3 rounded-[1.6rem] border border-gray-100 shadow-sm">
              <p className="text-[6px] font-black text-gray-400 uppercase tracking-[0.18em]">{mlTrustScore !== null ? 'ML Trust' : 'AI Confidence'}</p>
              <p className="text-lg font-black text-brand-red mt-1">
                {mlTrustScore !== null ? `${mlTrustScore}%` : data.biometricConfidence ? `${verificationScore}%` : 'QR'}
              </p>
            </div>
            <div className="bg-white p-3 rounded-[1.6rem] border border-gray-100 shadow-sm">
              <p className="text-[6px] font-black text-gray-400 uppercase tracking-[0.18em]">Scheme Rule</p>
              <p className={`text-[10px] font-black mt-2 ${isFree ? 'text-brand-green' : 'text-brand-dark'}`}>{isFree ? 'FREE TRAVEL' : 'STANDARD FARE'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm text-center">
               <p className="text-[7px] font-black text-gray-400 uppercase mb-1">TOTAL FARE</p>
               <p className={`text-2xl font-black tracking-tighter ${isFree ? 'text-brand-green' : 'text-brand-dark'}`}>
                 {isFree ? 'FREE' : '₹55.00'}
               </p>
            </div>
            <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm text-center">
               <p className="text-[7px] font-black text-gray-400 uppercase mb-1">TRIP AUDIT</p>
               <p className="text-xl font-black text-brand-red tracking-tighter uppercase mt-1">#{data.usageCount || 1}</p>
            </div>
          </div>

          {/* Route & Distance Section */}
          <div className="bg-white rounded-3xl p-4 border-2 border-gray-50 shadow-sm">
             <div className="flex justify-between items-center text-center">
                <div className="flex-1">
                  <p className="text-[6px] font-black text-brand-red uppercase mb-1">ORIGIN</p>
                  <p className="text-xs font-black text-brand-dark uppercase truncate">{origin}</p>
                </div>
                
                {/* Real-time Distance Display */}
                <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center text-gray-200">
                        <div className="w-2 h-0.5 bg-gray-200 rounded-full"></div>
                        <ArrowRight size={14} className="mx-1" />
                        <div className="w-2 h-0.5 bg-gray-200 rounded-full"></div>
                    </div>
                    <div className="bg-brand-cream px-2 py-0.5 rounded-md border border-brand-yellow/30 flex items-center gap-1">
                      <Navigation size={8} className="text-brand-dark" />
                      <p className="text-[8px] font-black text-brand-dark">{data.distanceAtIssue || '0 KM'}</p>
                    </div>
                </div>

                <div className="flex-1">
                  <p className="text-[6px] font-black text-brand-red uppercase mb-1">DESTINATION</p>
                  <p className="text-xs font-black text-brand-dark uppercase truncate">{destination}</p>
                </div>
             </div>
          </div>

          {/* Vehicle & Crew Info Grid */}
          <div className="grid grid-cols-3 gap-2">
             <div className="bg-brand-cream/50 p-2 rounded-2xl border border-brand-yellow/10 text-center">
                <p className="text-[5px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Vehicle No</p>
                <p className="text-[9px] font-black text-brand-dark uppercase truncate">{data.vehicleNo || '-'}</p>
             </div>
             <div className="bg-brand-cream/50 p-2 rounded-2xl border border-brand-yellow/10 text-center">
                <p className="text-[5px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Driver ID</p>
                <p className="text-[9px] font-black text-brand-dark uppercase truncate">{data.driverId || '-'}</p>
             </div>
             <div className="bg-brand-cream/50 p-2 rounded-2xl border border-brand-yellow/10 text-center">
                <p className="text-[5px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Conductor</p>
                <p className="text-[9px] font-black text-brand-dark uppercase truncate">{data.conductorId || '-'}</p>
             </div>
          </div>

          <div className="p-4 bg-brand-cream/80 rounded-3xl border border-brand-yellow/30 flex justify-between items-center">
            <div className="min-w-0 pr-2">
              <p className="text-[6px] font-black text-gray-400 uppercase mb-1">PASSENGER</p>
              <p className="text-sm font-black text-brand-dark uppercase truncate">{data.name}</p>
              <p className="text-[8px] font-black uppercase tracking-[0.14em] text-gray-400 mt-2">
                {data.gender === 'F' && data.isEligible ? 'Scheme eligible under AP female passenger rule' : 'Recorded under standard audit fare rule'}
              </p>
            </div>
            <BadgeCheck size={20} className="text-brand-green" />
          </div>

          <div className="flex flex-col items-center gap-2 py-4 bg-white rounded-[2rem] border border-gray-50 shadow-inner">
             {/* Safe Journey Caption */}
             <div className="flex items-center gap-1.5 opacity-80 mb-1">
               <ShieldCheck size={12} className="text-brand-green" />
               <p className="text-[8px] font-black text-brand-green uppercase tracking-[0.2em]">Have a Safe Journey</p>
             </div>
            {/* Task 19.3: Real QR code encoding ticketId */}
            <QRCodeSVG
              value={ticketId}
              size={80}
              bgColor="#FAF9F6"
              fgColor="#1A1A1A"
              level="M"
            />
            {/* Task 19.5: ticketId plain text below QR */}
            <p className="text-brand-dark font-black text-[10px] uppercase font-mono tracking-widest">{ticketId}</p>
          </div>
        </div>

        <div className="bg-brand-dark p-4 text-white flex justify-between items-center">
          <span className="text-[7px] font-black uppercase tracking-widest opacity-60">{today} • {time}</span>
          <div className="flex items-center gap-1.5 text-brand-yellow">
            <Heart size={8} className="fill-brand-yellow" />
            <span className="text-[6px] font-black uppercase tracking-widest">Welfare Mobility</span>
          </div>
        </div>
      </div>

      <div className="w-full mt-8 grid grid-cols-2 gap-3 no-print">
        <button onClick={handlePrint} className="bg-white text-brand-dark border-2 border-gray-100 font-black py-4 rounded-3xl flex items-center justify-center gap-2 shadow-sm uppercase text-[10px]">
          <Printer size={16} /> Print
        </button>
        <button onClick={handleDownload} className="bg-white text-brand-dark border-2 border-gray-100 font-black py-4 rounded-3xl flex items-center justify-center gap-2 shadow-sm uppercase text-[10px]">
          <Download size={16} /> Save
        </button>
      </div>

      <button onClick={onReset} className="w-full mt-6 bg-brand-red text-white font-black py-5 rounded-[2rem] shadow-xl flex items-center justify-center gap-3 uppercase tracking-widest no-print">
        <span>Close Receipt</span>
        <ArrowRight size={20} />
      </button>
    </div>
  );
};

export default Ticket;
