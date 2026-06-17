/**
 * audio_video_recorder.js
 * Captures Three.js canvas WebGL stream and mixes background music (.mp3)
 * locally in the browser using Web Audio API & MediaRecorder at zero server cost.
 */

class AudioVideoRecorder {
    constructor(canvasElement, audioElement) {
        this.canvas = canvasElement;
        this.audioElement = audioElement;
        
        if (!this.canvas || !this.audioElement) {
            console.error("Recorder initialization failed: Canvas or Audio element missing!");
            return;
        }
        
        this.audioContext = null;
        this.audioDestination = null;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.isRecording = false;
    }
    
    /**
     * Sets up the Web Audio context, mixes audio tracks, and initializes MediaRecorder
     */
    initRecorder() {
        try {
            // 1. Set up Web Audio Context for background music routing
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            const audioSource = this.audioContext.createMediaElementSource(this.audioElement);
            this.audioDestination = this.audioContext.createMediaStreamDestination();
            
            // Connect music to both the recorder and system speakers (user hears it while dancing)
            audioSource.connect(this.audioDestination);
            audioSource.connect(this.audioContext.destination);
            
            // 2. Capture Canvas Video Stream (30 FPS)
            const canvasStream = this.canvas.captureStream(30);
            const videoTrack = canvasStream.getVideoTracks()[0];
            
            // 3. Extract Audio Track from Web Audio mix
            const audioTrack = this.audioDestination.stream.getAudioTracks()[0];
            
            // 4. Combine Video and Audio into a single stream
            const combinedStream = new MediaStream([videoTrack, audioTrack]);
            
            // 5. Initialize MediaRecorder
            // WebM VP9/Opus is highly supported natively across modern browsers
            const options = { mimeType: 'video/webm;codecs=vp9,opus' };
            
            this.mediaRecorder = new MediaRecorder(combinedStream, options);
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = () => {
                this.exportVideo();
            };
            
            console.log("Audio/Video Recorder initialized successfully.");
        } catch (e) {
            console.error("Error initializing MediaRecorder:", e);
        }
    }
    
    /**
     * Starts background music and begins recording the canvas stream
     */
    start() {
        if (this.isRecording) return;
        
        // Initialize context on first user gesture (browser security requirement)
        if (!this.audioContext) {
            this.initRecorder();
        }
        
        // Resume AudioContext if suspended (browser security)
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        this.recordedChunks = [];
        
        // Reset audio and start playing
        this.audioElement.currentTime = 0;
        
        this.mediaRecorder.start();
        this.audioElement.play();
        
        this.isRecording = true;
        console.log("Recording started...");
    }
    
    /**
     * Stops music and finishes recording, triggering download
     */
    stop() {
        if (!this.isRecording) return;
        
        this.audioElement.pause();
        this.mediaRecorder.stop();
        
        this.isRecording = false;
        console.log("Recording stopped.");
    }
    
    /**
     * Compiles chunks and triggers browser download
     */
    exportVideo() {
        try {
            console.log("Compiling recorded chunks. Count:", this.recordedChunks.length);
            const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            
            // Create virtual download link and trigger download click
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = "My_Ternary_Ballet_Dance.webm";
            document.body.appendChild(a);
            a.click();
            
            // Cleanup memory
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);
            
            console.log("Video file exported successfully.");
        } catch (e) {
            console.error("Error compiling/exporting video:", e);
        }
    }
}
