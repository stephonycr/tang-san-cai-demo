/**
 * motion_capture.js
 * Integrates Google MediaPipe Pose for real-time joint tracking
 * and executes 3D skeletal retargeting mathematical operations using Three.js vectors.
 */

class MotionCaptureEngine {
    constructor(videoElement, avatarEngineInstance) {
        this.video = videoElement;
        this.avatar = avatarEngineInstance;
        
        if (!this.video || !this.avatar) {
            console.error("MotionCaptureEngine initialization failed: Video or Avatar missing!");
            return;
        }
        
        this.pose = null;
        this.cameraHelper = null;
        this.isTracking = false;

        // --- NEW: Pose-Triggered Performance Config ---
        this.isPoseTriggerMode = true;
        this.activePoseKey = 'optimal_1'; // Default start pose
        this.matchStartTime = null;
        this.requiredHoldTime = 1500;  // Must hold pose for 1.5 seconds to trigger
        
        // Callbacks to communicate with index.html frontend
        this.onPoseScore = null;   // function(score)
        this.onPoseSuccess = null; // function(poseKey)

        // 🏺 大唐时空幻影镜——骨骼角度定义数据库
        this.targetPoses = {
            optimal_1: {
                name: "反弹琵琶 · 双手水平",
                description: "双手抬起至水平位置，手臂自然伸展",
                angles: {
                    leftShoulder: 90,
                    rightShoulder: 90,
                    leftElbow: 165, // Relaxed from 180 to prevent camera perspective lock
                    rightElbow: 165 // Relaxed from 180 to prevent camera perspective lock
                }
            },
            optimal_2: {
                name: "大唐拂袖 · 抬起左手",
                description: "抬起左手高于肩膀即可",
                angles: {
                    leftShoulder: 140,
                    leftElbow: 165
                }
            },
            optimal_3: {
                name: "仙人指路 · 执乐仕女",
                description: "左手斜斜向外轻盈扬起，右手弯曲捧至胸前",
                angles: {
                    leftShoulder: 135, // Left arm raised away from waist
                    leftElbow: 165,    // Left elbow relaxed straight
                    rightShoulder: 135, // Right arm pointing down-forward
                    rightElbow: 90     // Right elbow bent in front of chest
                }
            },
            optimal_4: {
                name: "敦煌飞天 · 飞天乐伎",
                description: "左手高抬高于肩膀，右手向外微微舒展张开",
                angles: {
                    leftShoulder: 140, // Left arm raised high above shoulder
                    leftElbow: 165,    // Left elbow relaxed straight
                    rightShoulder: 150, // Right arm raised slightly away from body
                    rightElbow: 165    // Right elbow relaxed straight
                }
            }
        };
        
        this.initMediaPipe();
    }
    
    /**
     * Initializes Google MediaPipe Pose model
     */
    initMediaPipe() {
        try {
            console.log("[Diag - initMediaPipe] Step 1: before new Pose");
            this.pose = new Pose({
                locateFile: (file) => {
                    console.log("MediaPipe loading asset:", file);
                    return `mediapipe/${file}?v=106`;
                }
            });
            console.log(`[Diag - initMediaPipe] Step 2: after new Pose, type of this.pose: ${typeof this.pose}`);
            
            this.pose.setOptions({
                modelComplexity: 1, // Restored to 1 (Full) - matching the exact neural weights when it was working!
                smoothLandmarks: true,
                enableSegmentation: false,
                smoothSegmentation: false,
                minDetectionConfidence: 0.48, // High sensitivity fallback (lenient threshold)
                minTrackingConfidence: 0.48
            });
            console.log("[Diag - initMediaPipe] Step 3: after setOptions");
            
            this.pose.onResults((results) => this.onPoseResults(results));
            console.log("[Diag - initMediaPipe] Step 4: after onResults");
            
            console.log("MediaPipe Pose model loaded.");
        } catch (e) {
            console.error(`[Diag - initMediaPipe] CRASH! Error: ${e.message}`, e);
            throw e;
        }
    }
    
    /**
     * Starts the webcam capturing loop and feeds it to the Pose model
     */
    start() {
        console.log(`[Diag - Mocap.start] isTracking=${this.isTracking}, dimensions=${this.video.videoWidth}x${this.video.videoHeight}`);
        if (this.isTracking) return;
        
        // Safety Guard: Delay startup if the browser has not yet initialized the video track buffer (dimensions are 0x0)
        if (this.video.videoWidth === 0 || this.video.videoHeight === 0) {
            console.warn("[Mocap] Video element has 0x0 dimensions! Delaying camera helper startup by 300ms...");
            setTimeout(() => this.start(), 300);
            return;
        }
        
        this.isTracking = true;
        
        // Check if input is a physical webcam (has srcObject stream) or a playing video file (has src URL)
        const isWebcam = this.video.srcObject !== null;
        
        if (isWebcam) {
            console.log("Starting motion capture driven by physical Webcam...");
            try {
                this.cameraHelper = new Camera(this.video, {
                    onFrame: async () => {
                        if (this.isTracking) {
                            if (typeof window.incrementFrameCount === 'function') {
                                window.incrementFrameCount();
                            }
                            await this.pose.send({ image: this.video });
                        }
                    },
                    width: 640,
                    height: 480
                });
                this.cameraHelper.start();
            } catch (e) {
                console.error("Error starting physical webcam capture:", e);
                this.isTracking = false;
            }
        } else {
            console.log("Starting motion capture driven by playing Video File...");
            // Local frame extraction loop using browser animation frames
            const frameLoop = async () => {
                if (!this.isTracking) return;
                
                if (!this.video.paused && !this.video.ended) {
                    try {
                        if (typeof window.incrementFrameCount === 'function') {
                            window.incrementFrameCount();
                        }
                        await this.pose.send({ image: this.video });
                    } catch (e) {
                        console.error("Error sending video frame to MediaPipe Pose:", e);
                        if (this.isTracking) {
                            this.isTracking = false; // Stop the loop immediately to prevent alert spam
                            if (typeof showToast === 'function') {
                                showToast(`MediaPipe Pose error: ${e.message}`, "error");
                            } else {
                                console.error(`MediaPipe Pose error: ${e.message}`);
                            }
                        }
                    }
                }
                // Queue next frame loop
                if (this.isTracking) {
                    requestAnimationFrame(frameLoop);
                }
            };
            frameLoop();
        }
    }
    
    /**
     * Stops the webcam tracking loop
     */
    stop() {
        if (!this.isTracking) return;
        
        if (this.cameraHelper) {
            this.cameraHelper.stop();
        }
        this.isTracking = false;
        console.log("Webcam tracking stopped.");
    }
    
    /**
     * Callback when MediaPipe Pose completes image analysis on a frame
     */
    onPoseResults(results) {
        if (typeof window.incrementResultCount === 'function') {
            window.incrementResultCount();
        }
        
        if (!this.avatar) {
            if (typeof window.updateTrackingBadge === 'function') {
                window.updateTrackingBadge("error", "3D化身引擎未就绪");
            }
            return;
        }

        if (!results.poseLandmarks) {
            if (typeof window.updateTrackingBadge === 'function') {
                window.updateTrackingBadge("warning", "未识别到人物姿态");
            }
            if (this.onPoseScore) this.onPoseScore(0); // reset score
            this.matchStartTime = null; // reset timer
            return;
        }
        
        const landmarks = (results.poseWorldLandmarks && results.poseWorldLandmarks.length >= 29) 
                          ? results.poseWorldLandmarks 
                          : results.poseLandmarks;
        
        if (this.isPoseTriggerMode) {
            this.evaluatePoseMatching(landmarks);
        } else {
            if (typeof window.updateTrackingBadge === 'function') {
                window.updateTrackingBadge("success", "正在实时动捕中...");
            }
            this.retargetSkeletalBones(landmarks);
        }
    }
    
    /**
     * The Mathematical Retargeting Core:
     * Calculates vectors between joints and applies rotation Quaternions to Three.js bones
     */
    retargetSkeletalBones(lm) {
        // MediaPipe landmark index mapping helper
        const getVec = (index) => {
            const p = lm[index];
            // Invert Y to match Three.js coordinate system (Y goes up, MediaPipe Y goes down)
            // Invert Z to match coordinate depth
            return new THREE.Vector3(p.x, -p.y, -p.z);
        };
        
        try {
            // === 1. LEFT ARM ROTATION ===
            // Shoulder Pivot (Left Upper Arm)
            const shoulderL = getVec(11);
            const elbowL = getVec(13);
            const armDirL = new THREE.Vector3().subVectors(elbowL, shoulderL).normalize();
            // Default bone direction for left arm points horizontally outward: (1, 0, 0)
            const defaultUpperArmL = new THREE.Vector3(1, 0, 0);
            const qShoulderL = new THREE.Quaternion().setFromUnitVectors(defaultUpperArmL, armDirL);
            this.rotateJoint("shoulderL", qShoulderL);
            
            // Elbow Pivot (Left Forearm)
            const wristL = getVec(15);
            const forearmDirL = new THREE.Vector3().subVectors(wristL, elbowL).normalize();
            // Forearm rotates relative to upper arm, so we calculate rotation based on local bone projection
            const qElbowL = new THREE.Quaternion().setFromUnitVectors(armDirL, forearmDirL);
            this.rotateJoint("elbowL", qElbowL);
            
            // === 2. RIGHT ARM ROTATION ===
            // Shoulder Pivot (Right Upper Arm)
            const shoulderR = getVec(12);
            const elbowR = getVec(14);
            const armDirR = new THREE.Vector3().subVectors(elbowR, shoulderR).normalize();
            // Default bone direction for right arm points horizontally outward: (-1, 0, 0)
            const defaultUpperArmR = new THREE.Vector3(-1, 0, 0);
            const qShoulderR = new THREE.Quaternion().setFromUnitVectors(defaultUpperArmR, armDirR);
            this.rotateJoint("shoulderR", qShoulderR);
            
            // Elbow Pivot (Right Forearm)
            const wristR = getVec(16);
            const forearmDirR = new THREE.Vector3().subVectors(wristR, elbowR).normalize();
            const qElbowR = new THREE.Quaternion().setFromUnitVectors(armDirR, forearmDirR);
            this.rotateJoint("elbowR", qElbowR);
            
            // === 3. LEFT LEG ROTATION ===
            // Hip Pivot (Left Thigh)
            const hipL = getVec(23);
            const kneeL = getVec(25);
            const thighDirL = new THREE.Vector3().subVectors(kneeL, hipL).normalize();
            // Default bone direction for leg points straight down: (0, -1, 0)
            const defaultThighL = new THREE.Vector3(0, -1, 0);
            const qHipL = new THREE.Quaternion().setFromUnitVectors(defaultThighL, thighDirL);
            this.rotateJoint("hipL", qHipL);
            
            // Knee Pivot (Left Calf)
            const ankleL = getVec(27);
            const calfDirL = new THREE.Vector3().subVectors(ankleL, kneeL).normalize();
            const qKneeL = new THREE.Quaternion().setFromUnitVectors(thighDirL, calfDirL);
            this.rotateJoint("kneeL", qKneeL);
            
            // === 4. RIGHT LEG ROTATION ===
            // Hip Pivot (Right Thigh)
            const hipR = getVec(24);
            const kneeR = getVec(26);
            const thighDirR = new THREE.Vector3().subVectors(kneeR, hipR).normalize();
            const defaultThighR = new THREE.Vector3(0, -1, 0);
            const qHipR = new THREE.Quaternion().setFromUnitVectors(defaultThighR, thighDirR);
            this.rotateJoint("hipR", qHipR);
            
            // Knee Pivot (Right Calf)
            const ankleR = getVec(28);
            const calfDirR = new THREE.Vector3().subVectors(ankleR, kneeR).normalize();
            const qKneeR = new THREE.Quaternion().setFromUnitVectors(thighDirR, calfDirR);
            this.rotateJoint("kneeR", qKneeR);
            
            // === 5. SPINE/NECK (Simple Body Leaning) ===
            const shoulderMid = new THREE.Vector3().addVectors(shoulderL, shoulderR).multiplyScalar(0.5);
            const hipMid = new THREE.Vector3().addVectors(hipL, hipR).multiplyScalar(0.5);
            const spineDir = new THREE.Vector3().subVectors(shoulderMid, hipMid).normalize();
            const defaultSpine = new THREE.Vector3(0, 1, 0); // Upward
            const qSpine = new THREE.Quaternion().setFromUnitVectors(defaultSpine, spineDir);
            this.rotateJoint("spine", qSpine);
            
        } catch (e) {
            console.error("Error executing skeletal retargeting math:", e);
            // Do not re-throw here to prevent killing the MediaPipe frame loop!
        }
    }
    
    /**
     * Helper to rotate a specific joint node in Three.js using a Quaternion
     */
    rotateJoint(jointName, quaternion) {
        if (!this.avatar || !this.avatar.joints) {
            if (!this.hasLoggedJointError) {
                console.warn("[Mocap Engine] rotateJoint skipped: Avatar or joints map is missing/undefined!", this.avatar);
                this.hasLoggedJointError = true;
            }
            return;
        }
        const boneGroup = this.avatar.joints[jointName];
        if (boneGroup) {
            // Interpolate smoothly (Slerp) to reduce jitter from tracking noise
            boneGroup.quaternion.slerp(quaternion, 0.3);
        }
    }

    /**
     * Helper to calculate the 3D angle between three joints
     */
    calculateAngle(joint, ptA, ptB) {
        const vA = new THREE.Vector3().subVectors(ptA, joint).normalize();
        const vB = new THREE.Vector3().subVectors(ptB, joint).normalize();
        const dot = vA.dot(vB);
        const clampedDot = Math.max(-1, Math.min(1, dot));
        return Math.acos(clampedDot) * (180 / Math.PI);
    }

    /**
     * Evaluates if the user's current landmarks match the active target pose
     */
    evaluatePoseMatching(lm) {
        if (!lm) return;

        const getVec = (index) => {
            const p = lm[index];
            if (!p) return null; // Defensive guard: returns null if landmark is missing
            return new THREE.Vector3(p.x, -p.y, -p.z);
        };

        try {
            // Get target pose config
            const target = this.targetPoses[this.activePoseKey];
            if (!target) return;

            // 1. Calculate ONLY the requested joint angles on-demand to prevent out-of-frame landmark crashes!
            const jointValues = {};

            // Helper to check if a set of landmarks are all present
            const hasLandmarks = (indices) => {
                return indices.every(idx => lm[idx] !== undefined && lm[idx] !== null);
            };

            // --- DECOUPLED ON-DEMAND JOINT CALCULATIONS ---
            
            // 1. Left Arm (tracked only if needed, independent of right arm)
            const needsLeftArm = ['leftShoulder', 'leftElbow'].some(k => k in target.angles);
            if (needsLeftArm && hasLandmarks([11, 13, 15])) {
                const shoulderL = getVec(11);
                const elbowL = getVec(13);
                const wristL = getVec(15);
                if (shoulderL && elbowL && wristL) {
                    jointValues.leftElbow = this.calculateAngle(elbowL, shoulderL, wristL);
                    const upVec = new THREE.Vector3(0, 1, 0);
                    const dirL = new THREE.Vector3().subVectors(elbowL, shoulderL).normalize();
                    jointValues.leftShoulder = Math.acos(Math.max(-1, Math.min(1, dirL.dot(upVec)))) * (180 / Math.PI);
                }
            }

            // 2. Right Arm (tracked only if needed, independent of left arm)
            const needsRightArm = ['rightShoulder', 'rightElbow'].some(k => k in target.angles);
            if (needsRightArm && hasLandmarks([12, 14, 16])) {
                const shoulderR = getVec(12);
                const elbowR = getVec(14);
                const wristR = getVec(16);
                if (shoulderR && elbowR && wristR) {
                    jointValues.rightElbow = this.calculateAngle(elbowR, shoulderR, wristR);
                    const upVec = new THREE.Vector3(0, 1, 0);
                    const dirR = new THREE.Vector3().subVectors(elbowR, shoulderR).normalize();
                    jointValues.rightShoulder = Math.acos(Math.max(-1, Math.min(1, dirR.dot(upVec)))) * (180 / Math.PI);
                }
            }

            // 3. Left Leg (tracked only if needed, independent of right leg)
            const needsLeftLeg = ['leftHip', 'leftKnee'].some(k => k in target.angles);
            if (needsLeftLeg) {
                if (hasLandmarks([23, 25, 27])) {
                    const hipL = getVec(23);
                    const kneeL = getVec(25);
                    const ankleL = getVec(27);
                    if (hipL && kneeL && ankleL) {
                        jointValues.leftKnee = this.calculateAngle(kneeL, hipL, ankleL);
                        const downVec = new THREE.Vector3(0, -1, 0);
                        const thighDirL = new THREE.Vector3().subVectors(kneeL, hipL).normalize();
                        jointValues.leftHip = Math.acos(Math.max(-1, Math.min(1, thighDirL.dot(downVec)))) * (180 / Math.PI);
                    }
                } else {
                    if (typeof window.updateTrackingBadge === 'function') {
                        window.updateTrackingBadge("warning", `⚠️ 请后退，确保左腿完全入镜`);
                    }
                }
            }

            // 4. Right Leg (tracked only if needed, independent of left leg)
            const needsRightLeg = ['rightHip', 'rightKnee'].some(k => k in target.angles);
            if (needsRightLeg) {
                if (hasLandmarks([24, 26, 28])) {
                    const hipR = getVec(24);
                    const kneeR = getVec(26);
                    const ankleR = getVec(28);
                    if (hipR && kneeR && ankleR) {
                        jointValues.rightKnee = this.calculateAngle(kneeR, hipR, ankleR);
                        const downVec = new THREE.Vector3(0, -1, 0);
                        const thighDirR = new THREE.Vector3().subVectors(kneeR, hipR).normalize();
                        jointValues.rightHip = Math.acos(Math.max(-1, Math.min(1, thighDirR.dot(downVec)))) * (180 / Math.PI);
                    }
                } else {
                    if (typeof window.updateTrackingBadge === 'function') {
                        window.updateTrackingBadge("warning", `⚠️ 请后退，确保右腿完全入镜`);
                    }
                }
            }

            // 2. Score only the joints defined in the active target pose (Tolerance: relaxed to 42 degrees for organic feel)
            const maxTolerance = 42;
            const calculateJointMatch = (userVal, targetVal) => {
                const diff = Math.abs(userVal - targetVal);
                return Math.max(0, 100 - (diff / maxTolerance) * 100);
            };

            let scores = [];
            for (const jointKey in target.angles) {
                if (jointValues[jointKey] !== undefined) {
                    const userVal = jointValues[jointKey];
                    const targetVal = target.angles[jointKey];
                    const jointScore = calculateJointMatch(userVal, targetVal);
                    scores.push(jointScore);
                } else {
                    // Fallback to 0 if a required landmark is missing or out of frame
                    scores.push(0);
                }
            }

            // Total score is the average match rate across all specified parameters
            const totalScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

            // Send score to the frontend callback
            if (this.onPoseScore) {
                this.onPoseScore(totalScore);
            }

            // 3. Track duration for how long they hold this pose (Trigger threshold relaxed to 60%)
            if (totalScore >= 60) {
                if (!this.matchStartTime) {
                    this.matchStartTime = Date.now();
                    if (typeof window.updateTrackingBadge === 'function') {
                        window.updateTrackingBadge("info", `姿势契合！保持住... (Hold pose...)`);
                    }
                } else {
                    const duration = Date.now() - this.matchStartTime;
                    const progress = Math.min(100, Math.round((duration / this.requiredHoldTime) * 100));
                    if (typeof window.updateTrackingBadge === 'function') {
                        window.updateTrackingBadge("info", `时空共振中: ${progress}%`);
                    }

                    if (duration >= this.requiredHoldTime) {
                        this.matchStartTime = null; // reset
                        this.isPoseTriggerMode = false; // Disable trigger mode temporarily so they can watch the dance!
                        
                        if (this.onPoseSuccess) {
                            this.onPoseSuccess(this.activePoseKey);
                        }
                    }
                }
            } else {
                if (this.matchStartTime) {
                    this.matchStartTime = null;
                    if (typeof window.updateTrackingBadge === 'function') {
                        window.updateTrackingBadge("warning", `姿势中断，请根据剪影重新调整`);
                    }
                }
            }

        } catch (e) {
            console.error("Error during pose matching evaluation:", e);
        }
    }

    async restartCamera() {
        if (this.camera) {
            console.log("[Mocap Engine] Forcefully restarting webcam camera helper...");
            try {
                this.camera.stop();
                await new Promise(resolve => setTimeout(resolve, 80)); // Short pause for hardware release
                await this.camera.start();
                console.log("[Mocap Engine] Camera helper restarted successfully.");
            } catch (err) {
                console.error("[Mocap Engine] Failed to restart camera helper:", err);
            }
        }
    }
}
