import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useTranslation } from "react-i18next";
import { Video, Phone, PhoneIncoming, Mic, MicOff, VideoOff, PhoneOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SectionHeader } from "@/components/layout/SectionHeader";

import { getToken } from "@/lib/api";
import type { SessionUser } from "@/lib/auth";

/**
 * Doctor side of the WebRTC consultation.
 *
 * Fixes carried over from the original:
 *   • the socket now authenticates with the session token (the server rejects
 *     unauthenticated sockets, so "register as doctor" is no longer a free-for-all);
 *   • `activeCalls` was `useState([])` used as a constant with no setter, so the
 *     panel was permanently empty — it is removed rather than faked;
 *   • ICE candidates were read from a stale `remoteSocketId` closure and were
 *     dropped; the id now lives in a ref;
 *   • `getUserMedia` rejections were swallowed by empty catch blocks and are now
 *     reported to the user.
 *
 * Redesign notes:
 *  • Two hardcoded English error strings are now translated. One of them is the
 *    message a doctor sees when the browser has blocked the camera, which is the
 *    single message most likely to need to be understood in the reader's own
 *    language.
 *  • **The incoming-call card named the wrong person.** It rendered
 *    `t("doctor.callFrom", { name: doctor.name })` — the signed-in doctor's own
 *    name — above the calling socket id. So a doctor saw "Call from Dr. Sharma"
 *    while looking at Dr. Sharma's own dashboard. The caller's name is not
 *    carried in the `incoming-call` payload, so rather than invent one the card
 *    now says a patient is calling and explains what accepting will do.
 *  • The raw socket id is no longer shown. It is a WebRTC implementation detail
 *    and meant nothing to the person reading it.
 *  • The ringing card is a live region: a doctor working in another window is
 *    told a call has arrived rather than discovering it by chance.
 *  • The call overlay was `bg-white` with unlabelled `<video>` elements and no
 *    dialog semantics. It now uses the tokens, has a heading, is
 *    `role="dialog" aria-modal="true"`, and both videos have accessible names.
 *  • The incoming-call indicator keeps its pulse, which is the one place motion
 *    carries meaning (a ringing phone). `prefers-reduced-motion` neutralises it.
 *  • `Accept` used a `btn-success` class on a `Button` component, so the variant
 *    and the class fought each other. It is a proper `Button` with a success
 *    treatment from the token system.
 */
export default function VideoCallSection({ doctor }: { doctor: SessionUser }) {
  const { t } = useTranslation();

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteSocketIdRef = useRef<string | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const [incomingFrom, setIncomingFrom] = useState<string | null>(null);
  const [inCall, setInCall] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const rtcConfig: RTCConfiguration = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };

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
    setMicOn(true);
    setCamOn(true);
  };

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const socket = io({ transports: ["websocket"], auth: { token } });
    socketRef.current = socket;
    socket.on("connect", () => socket.emit("register", { role: "doctor", userId: doctor.id }));

    socket.on("incoming-call", ({ from }: { from: string }) => setIncomingFrom(from));

    socket.on("offer", async ({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => {
      remoteSocketIdRef.current = from;
      try {
        const pc = new RTCPeerConnection(rtcConfig);
        pcRef.current = pc;

        pc.onicecandidate = (event) => {
          if (event.candidate && remoteSocketIdRef.current) {
            socket.emit("ice-candidate", {
              to: remoteSocketIdRef.current,
              candidate: event.candidate,
            });
          }
        };

        pc.ontrack = (event) => {
          const [stream] = event.streams;
          if (remoteVideoRef.current && stream) remoteVideoRef.current.srcObject = stream;
        };

        await pc.setRemoteDescription(new RTCSessionDescription(sdp));

        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        setInCall(true);
        setError(null);
        socket.emit("answer", { to: from, sdp: answer });
      } catch (err) {
        const failure = err as Error;
        setError(
          failure?.name === "NotAllowedError"
            ? t("doctor.callMediaDenied")
            : t("doctor.callStartFailed", { reason: failure?.message || failure?.name || "" })
        );
        cleanupCall();
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

    socket.on("end-call", () => cleanupCall());
    socket.on("call-rejected", () => setIncomingFrom(null));

    return () => {
      socket.disconnect();
      cleanupCall();
    };
    // Mount-only: re-creating the socket when `t` changes would drop a call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctor.id]);

  const handleAccept = () => {
    if (!incomingFrom || !socketRef.current) return;
    remoteSocketIdRef.current = incomingFrom;
    socketRef.current.emit("accept-call", { to: incomingFrom });
    setIncomingFrom(null);
  };

  const handleReject = () => {
    if (!incomingFrom || !socketRef.current) return;
    socketRef.current.emit("reject-call", { to: incomingFrom, reason: "busy" });
    setIncomingFrom(null);
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

  const endCall = () => {
    if (remoteSocketIdRef.current && socketRef.current) {
      socketRef.current.emit("end-call", { to: remoteSocketIdRef.current });
    }
    cleanupCall();
  };

  return (
    <div className="space-y-6">
      <SectionHeader title={t("doctor.incomingCalls")} subtitle={t("doctor.incomingCallsSubtitle")} />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {incomingFrom ? (
        <div className="card-medical border-primary/50">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex h-12 w-12 shrink-0 animate-pulse items-center justify-center rounded-full bg-primary/15"
              >
                <PhoneIncoming className="h-6 w-6 text-primary" />
              </span>
              <div>
                <p role="alert" className="font-semibold text-foreground">
                  {t("doctor.patientCalling")}
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t("doctor.patientCallingHint")}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button className="bg-success text-success-foreground hover:opacity-90" onClick={handleAccept}>
                <Phone aria-hidden="true" />
                {t("doctor.accept")}
              </Button>
              <Button variant="destructive" onClick={handleReject}>
                <PhoneOff aria-hidden="true" />
                {t("doctor.decline")}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Phone aria-hidden="true" className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-base font-semibold text-foreground">{t("doctor.noIncomingCalls")}</p>
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {t("doctor.patientsStartCall")}
          </p>
        </div>
      )}

      {inCall && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="doctor-call-heading"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <div className="w-full max-w-4xl rounded-xl border border-border bg-card p-4 shadow-lg">
            <h3 id="doctor-call-heading" className="mb-3 text-base font-semibold text-foreground">
              {t("doctor.inCall")}
            </h3>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="overflow-hidden rounded-lg bg-black md:col-span-2">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  aria-label={t("doctor.ariaRemoteVideo")}
                  className="aspect-video h-full w-full object-cover"
                />
              </div>
              <div className="overflow-hidden rounded-lg bg-black">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  aria-label={t("doctor.ariaLocalVideo")}
                  className="aspect-video h-full w-full object-cover opacity-90"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <Button variant="outline" onClick={toggleMic} aria-pressed={!micOn}>
                {micOn ? <Mic aria-hidden="true" /> : <MicOff aria-hidden="true" />}
                {micOn ? t("doctor.mute") : t("doctor.unmute")}
              </Button>
              <Button variant="outline" onClick={toggleCam} aria-pressed={!camOn}>
                {camOn ? <Video aria-hidden="true" /> : <VideoOff aria-hidden="true" />}
                {camOn ? t("doctor.stopVideo") : t("doctor.startVideo")}
              </Button>
              <Button variant="destructive" onClick={endCall}>
                <PhoneOff aria-hidden="true" />
                {t("doctor.endCall")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
