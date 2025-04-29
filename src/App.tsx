// Import necessary libraries from React and MediaPipe
import { useEffect, useRef, useState } from "react";
import {
  HandLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "@mediapipe/tasks-vision";

import "./App.css";

function App() {
  // References for the video and canvas elements
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // App state: hand model, webcam status, and current detected gesture
  const [handLandmarker, setHandLandmarker] = useState<HandLandmarker | null>(null);
  const [webcamRunning, setWebcamRunning] = useState(false);
  const [gestureText, setGestureText] = useState<string | null>(null);

  // Variables for gesture stabilization (avoids flickering)
  const [lastDetectedGesture, setLastDetectedGesture] = useState<string | null>(null);
  const [stableCounter, setStableCounter] = useState(0);
  const STABILITY_THRESHOLD = 40; // About 0.7 seconds at 30 fps

  // Helper: checks if a finger is considered "up"
  function isFingerUp(tip: any, pip: any): boolean {
    return tip.y < pip.y;
  }

  // Main gesture recognition logic using hand landmark positions
  function getGestureName(landmarks: any): string | null {
    const thumb = isFingerUp(landmarks[4], landmarks[3]);
    const index = isFingerUp(landmarks[8], landmarks[6]);
    const middle = isFingerUp(landmarks[12], landmarks[10]);
    const ring = isFingerUp(landmarks[16], landmarks[14]);
    const pinky = isFingerUp(landmarks[20], landmarks[18]);

    const thumbToIndexDistance = Math.sqrt(
      Math.pow(landmarks[4].x - landmarks[8].x, 2) +
      Math.pow(landmarks[4].y - landmarks[8].y, 2)
    );

    // I ❤️ You: Thumb, index, pinky up; middle and ring down
    if (thumb && index && !middle && !ring && pinky) {
      if (thumbToIndexDistance > 0.1) {
        return "I ❤️ You";
      }
    }

    // Letter A: Only the thumb is up
    if (!index && !middle && !ring && !pinky && thumb) {
      return "A";
    }

    // Letter B: Index and middle up; thumb near wrist
    const thumbToWristDistance = Math.abs(landmarks[4].x - landmarks[0].x);
    if (thumbToWristDistance < 0.1 && index && middle && !ring && !pinky) {
      return "B";
    }

    // Hello: All fingers up
    if (thumb && index && middle && ring && pinky) {
      return "Hello";
    }

    // Peace ✌️: Index and middle up, others down
    if (!thumb && index && middle && !ring && !pinky) {
      return "Peace";
    }

    return null;
  }

  // Load the hand tracking model on app start
  useEffect(() => {
    const loadModel = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
      );

      const landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
      });

      setHandLandmarker(landmarker);
    };

    loadModel();
  }, []);

  // Hand detection and drawing loop
  useEffect(() => {
    let animationFrameId: number;

    const detectHands = async () => {
      if (!handLandmarker || !videoRef.current || !canvasRef.current || videoRef.current.readyState < 2) {
        animationFrameId = requestAnimationFrame(detectHands);
        return;
      }

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      canvas.style.width = `${videoRef.current.videoWidth}px`;
      canvas.style.height = `${videoRef.current.videoHeight}px`;

      const results = handLandmarker.detectForVideo(
        videoRef.current,
        performance.now()
      );

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const draw = new DrawingUtils(ctx);

      if (results.landmarks) {
        for (const landmarks of results.landmarks) {
          draw.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
            color: "#00FF00",
            lineWidth: 4,
          });
          draw.drawLandmarks(landmarks, { color: "#FF0000", lineWidth: 2 });

          const detectedGesture = getGestureName(landmarks);

          // Confirm gesture only if it appears stable
          if (detectedGesture) {
            if (detectedGesture === lastDetectedGesture) {
              setStableCounter((prev) => prev + 1);

              if (stableCounter > STABILITY_THRESHOLD && gestureText !== detectedGesture) {
                setGestureText(detectedGesture);
              }
            } else {
              setLastDetectedGesture(detectedGesture);
              setStableCounter(0);
            }
          }
        }
      }

      animationFrameId = requestAnimationFrame(detectHands);
    };

    if (webcamRunning) {
      detectHands();
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [handLandmarker, webcamRunning, gestureText, lastDetectedGesture, stableCounter]);

  // Function to start webcam stream
  const enableCam = async () => {
    if (!navigator.mediaDevices || !videoRef.current) return;

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    videoRef.current.srcObject = stream;

    videoRef.current.onloadeddata = () => {
      setWebcamRunning(true);
    };
  };

  // Main UI layout
  return (
    <div className="App" style={{ textAlign: "center", padding: "20px" }}>
      <h1>Sign Bridge Detection</h1>
      <button style={{ color: "#213547", font: "#213547" }} onClick={enableCam}>
        Enable Webcam
      </button>

      {/* Video preview with canvas overlays */}
      <div
        style={{
          position: "relative",
          width: "640px",
          height: "480px",
          margin: "0 auto",
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            borderRadius: "10px",
            boxShadow: "0 4px 8px rgba(0, 0, 0, 0.2)",
            marginTop: "20px",
          }}
        />
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
          }}
        />
      </div>

      {/* Output box for recognized gesture */}
      <div
        style={{
          border: "2px solid #213547",
          borderRadius: "10px",
          padding: "20px",
          marginTop: "40px",
          minHeight: "80px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "20px",
            color: "#213547",
            fontWeight: "bold",
          }}
        >
          {gestureText ? gestureText : "Waiting for gesture..."}
        </p>
      </div>
    </div>
  );
}

export default App;