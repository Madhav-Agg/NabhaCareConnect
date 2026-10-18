import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { io, type Socket } from "socket.io-client";
import {
  Phone,
  Video,
  Mic,
  MicOff,
  VideoOff,
  PhoneOff,
  Stethoscope,
  RefreshCw,
  DoorOpen,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/EmptyState";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { useToast } from "@/hooks/use-toast";

import { api, apiPath, getToken } from "@/lib/api";
import { localizedError } from "@/lib/apiErrors";
import { initials } from "@/lib/format";

interface Doctor {
  phone: string;
  name: string;
  specialty: string | null;
  room: string | null;
}

/**
 * Patient side of the video consultation.
 *
 * Redesign notes:
 *  • The call overlay was `bg-white` with a literal `bg-black` pair of video
 *    frames. It now uses the token surfaces, so it is a coherent dark-call UI in
 *    both themes instead of a white slab flashing over a dark page.
 *  • The overlay is a real `role="dialog" aria-modal="true"` with a heading and
 *    labelled video elements. The two `<video>` elements had no accessible name
 *    at all, so a screen-reader user got two unlabelled media regions.
 *  • "—" is gone as the specialty fallback: an em-dash is not a word. It falls
 *    back to `patient.video.doctorFallback`.
 *  • The doctor's phone number was a `Button` wrapping a `tel:` link, so it was
 *    announced as a button, not as a link/telephone number. It is now an
 *    `outline` Button with `asChild` and an explicit `aria-label` that says what
 *    the number is.
 *  • The three toasts and the waiting message were hardcoded English; they now
 *    come from the bundle.
 *  • The calling state is a disabled, labelled button rather than a silent
 *    no-op, and the error alert is announced.
 */
export const VideoConsultSection = () => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [callingDoctor, setCallingDoctor] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteSocketIdRef = useRef<string | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const [inCall, setInCall] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  const rtcConfig: RTCConfiguration = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };

  const loadDoctors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api<{ data: Doctor[] }>(apiPath("patient", "/appointments/doctors"));
      setDoctors(result.data || []);
    } catch (err) {
      setError(localizedError(err, t, "errors.generic"));
      setDoctors([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadDoctors();
  }, [loadDoctors]);

  const cleanupCall = () => {
    try {
      pcRef.current?.close();
    } catch {
      /* already closed */
    }
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    remoteSocketIdRef.current = null;
    setInCall(false);
    setCallingDoctor(null);
    setMicOn(true);
    setCamOn(true);
  };

  const createPeer = (toSocketId: string) => {
    const pc = new RTCPeerConnection(rtcConfig);
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit("ice-candidate", { to: toSocketId, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (remoteVideoRef.current && stream) remoteVideoRef.current.srcObject = stream;
    };

    return pc;
  };

  const startAsCaller = async (toSocketId: string) => {
    remoteSocketIdRef.current = toSocketId;
    const pc = createPeer(toSocketId);

    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    setInCall(true);
    socketRef.current?.emit("offer", { to: toSocketId, sdp: offer });
  };

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const socket = io({ transports: ["websocket"], auth: { token } });
    socketRef.current = socket;
    socket.on("connect", () => socket.emit("register", { role: "patient" }));

    socket.on("call-accepted", async ({ from }: { from: string }) => {
      try {
        await startAsCaller(from);
      } catch {
        setCallError(t("patient.video.callFailed"));
        cleanupCall();
      }
    });

    socket.on("answer", async ({ sdp }: { sdp: RTCSessionDescriptionInit }) => {
      try {
        if (pcRef.current) await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch {
        /* remote description arrived after teardown */
      }
    });

    socket.on("ice-candidate", async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      try {
        if (pcRef.current && candidate) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch {
        /* candidate arrived after teardown */
      }
    });

    socket.on("call-rejected", () => cleanupCall());
    socket.on("end-call", () => cleanupCall());

    return () => {
      socket.disconnect();
      cleanupCall();
    };
    // Mount-only: the socket lifecycle must not be re-created when `t` changes,
    // or switching language would drop an in-progress consultation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCall = async (doctor: Doctor) => {
    setCallError(null);
    setCallingDoctor(doctor.phone);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      socketRef.current?.emit("call-user", {
        doctorPhone: doctor.phone,
        doctorName: doctor.name,
        reason: "patient-start",
      });
      toast({
        title: t("patient.video.callingToast", { name: doctor.name }),
        description: t("doctor.waitingForDoctor"),
      });
    } catch {
      // Camera or microphone denied. Say so rather than leaving a call that
      // looks connected but is silent.
      setCallError(t("patient.video.callFailed"));
      setCallingDoctor(null);
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
  };

  const toggleMic = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !micOn;
    stream.getAudioTracks().forEach((track) => (track.enabled = next));
    setMicOn(next);
  };

  const toggleCam = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !camOn;
    stream.getVideoTracks().forEach((track) => (track.enabled = next));
    setCamOn(next);
  };

  const leaveCall = () => {
    if (remoteSocketIdRef.current) {
      socketRef.current?.emit("end-call", { to: remoteSocketIdRef.current });
    }
    cleanupCall();
  };

  if (loading) {
    return (
      <div className="app-container">
        <Skeleton className="h-8 w-56" />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <SectionHeader
        title={t("patient.video.title")}
        subtitle={t("patient.video.subtitle")}
        actions={
          <Button variant="outline" onClick={loadDoctors}>
            <RefreshCw aria-hidden="true" />
            {t("common.refresh")}
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {callError && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{callError}</AlertDescription>
        </Alert>
      )}

      {doctors.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title={t("patient.video.noDoctors")}
          hint={t("patient.video.noDoctorsHint")}
          action={
            <Button variant="outline" onClick={loadDoctors}>
              <RefreshCw aria-hidden="true" />
              {t("common.refresh")}
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {doctors.map((doctor) => (
            <li key={doctor.phone} className="card-medical flex flex-col">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
                >
                  {initials(doctor.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-base font-semibold text-foreground">
                    {doctor.name}
                  </h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {doctor.specialty || t("patient.video.doctorFallback")}
                  </p>
                </div>
                {doctor.room && (
                  <Badge variant="secondary" className="shrink-0">
                    <DoorOpen aria-hidden="true" className="h-3 w-3" />
                    {t("doctor.room", { number: doctor.room })}
                  </Badge>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  onClick={() => startCall(doctor)}
                  disabled={callingDoctor === doctor.phone}
                  aria-busy={callingDoctor === doctor.phone}
                >
                  <Video aria-hidden="true" />
                  {callingDoctor === doctor.phone
                    ? t("patient.video.calling")
                    : t("patient.video.call")}
                </Button>
                <Button asChild variant="outline">
                  <a
                    href={`tel:${doctor.phone}`}
                    aria-label={t("patient.emergency.ariaCall", {
                      name: doctor.name,
                      number: doctor.phone,
                    })}
                  >
                    <Phone aria-hidden="true" />
                    {doctor.phone}
                  </a>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
        {t("patient.video.privacy")}
      </p>

      {inCall && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="call-heading"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <div className="w-full max-w-4xl rounded-xl border border-border bg-card p-4 shadow-lg">
            <h2 id="call-heading" className="mb-3 text-base font-semibold text-foreground">
              {t("patient.video.callInProgress")}
            </h2>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="overflow-hidden rounded-lg bg-black md:col-span-2">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  aria-label={t("patient.video.ariaRemote")}
                  className="aspect-video h-full w-full object-cover"
                />
              </div>
              <div className="overflow-hidden rounded-lg bg-black">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  aria-label={t("patient.video.ariaLocal")}
                  className="aspect-video h-full w-full object-cover"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <Button
                variant={micOn ? "secondary" : "destructive"}
                onClick={toggleMic}
                aria-pressed={!micOn}
              >
                {micOn ? <Mic aria-hidden="true" /> : <MicOff aria-hidden="true" />}
                {micOn ? t("doctor.mute") : t("doctor.unmute")}
              </Button>
              <Button
                variant={camOn ? "secondary" : "destructive"}
                onClick={toggleCam}
                aria-pressed={!camOn}
              >
                {camOn ? <Video aria-hidden="true" /> : <VideoOff aria-hidden="true" />}
                {camOn ? t("doctor.stopVideo") : t("doctor.startVideo")}
              </Button>
              <Button variant="destructive" onClick={leaveCall}>
                <PhoneOff aria-hidden="true" />
                {t("patient.video.leave")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
