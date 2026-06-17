/**
 * avatar_puppet.js
 * WebGL 3D Avatar Engine using Three.js.
 * Handles 3D environment, lights, camera, and builds a hierarchical geometric puppet fallback.
 */

class AvatarEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error(`Canvas element with ID ${canvasId} not found!`);
            return;
        }
        
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        
        // Joint and Bone Map
        this.joints = {}; // Flat map for quick rotation updates
        this.skeletonRoot = null; // Reference to hips (root)
        
        // --- NEW: State-based Procedural Animation System ---
        this.animationState = 'IDLE'; // 'IDLE' | 'DANCE_SLEEVE' | 'DANCE_LUTE' | 'DANCE_POINTER'
        this.danceStartTime = 0;
        this.danceDuration = 12000;  // Pre-animated dance runs for 12 seconds, then returns to IDLE
        
        this.initEnvironment();
        this.buildMannequin();
        this.animate();
        
        // Handle resizing
        window.addEventListener('resize', () => this.onWindowResize());
    }
    
    /**
     * Sets up Three.js scene, camera, renderer, and lighting
     */
    initEnvironment() {
        // 1. Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111111); // Clean dark background
        
        // 2. Camera
        this.camera = new THREE.PerspectiveCamera(45, this.canvas.clientWidth / this.canvas.clientHeight, 0.1, 100);
        this.camera.position.set(0, 1.5, 4.5); // Look at chest level from 4.5m away
        
        // 3. Renderer
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, preserveDrawingBuffer: true });
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // 4. Studio Lighting (Ceramic glaze Sancai look)
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const dirLight1 = new THREE.DirectionalLight(0xffe3b3, 1.0); // Warm key light
        dirLight1.position.set(2, 4, 3);
        dirLight1.castShadow = true;
        dirLight1.shadow.mapSize.width = 1024;
        dirLight1.shadow.mapSize.height = 1024;
        this.scene.add(dirLight1);
        
        const dirLight2 = new THREE.DirectionalLight(0xb3e0ff, 0.6); // Cool fill light
        dirLight2.position.set(-2, 2, -2);
        this.scene.add(dirLight2);
        
        // 5. Floor/Ground (For shadows and spatial depth)
        const floorGeo = new THREE.PlaneGeometry(10, 10);
        const floorMat = new THREE.MeshStandardMaterial({ 
            color: 0x222222, 
            roughness: 0.8, 
            metalness: 0.2 
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.scene.add(floor);
        
        // 6. Orbit Controls (allow user to rotate avatar viewpoint)
        if (typeof THREE.OrbitControls !== 'undefined') {
            this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.05;
            this.controls.maxPolarAngle = Math.PI / 2; // Don't go below floor
            this.controls.minDistance = 1.5;
            this.controls.maxDistance = 10;
            this.controls.target.set(0, 1.0, 0); // Orbit around hips/chest
        }
    }
    
    /**
     * Builds a hierarchical geometric mannequin/puppet representing human skeleton
     */
    buildMannequin() {
        // 1. Define Sancai Ceramic Glaze and Matte Materials (MeshPhysicalMaterial for clearcoat shine)
        const glazeGreen = new THREE.MeshPhysicalMaterial({
            color: 0x2e7d32, // Sancai Green
            roughness: 0.15,
            metalness: 0.1,
            clearcoat: 1.0,
            clearcoatRoughness: 0.1
        });
        
        const glazeAmber = new THREE.MeshPhysicalMaterial({
            color: 0xffa000, // Sancai Amber/Yellow
            roughness: 0.15,
            metalness: 0.1,
            clearcoat: 1.0,
            clearcoatRoughness: 0.1
        });
        
        const glazeCream = new THREE.MeshPhysicalMaterial({
            color: 0xfffdd0, // Sancai Cream White
            roughness: 0.15,
            metalness: 0.1,
            clearcoat: 1.0,
            clearcoatRoughness: 0.1
        });
        
        const matteFace = new THREE.MeshStandardMaterial({
            color: 0xfff3e0, // Soft bisque/clay face
            roughness: 0.85,
            metalness: 0.0
        });
        
        const matteHair = new THREE.MeshStandardMaterial({
            color: 0x212121, // Charcoal/black hair
            roughness: 0.9,
            metalness: 0.0
        });

        // 2. Mesh Construction Helpers
        const createJoint = (name, geometry, material) => {
            const group = new THREE.Group();
            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true;
            group.add(mesh);
            this.joints[name] = group;
            return group;
        };

        const createClothingSegment = (geometry, material) => {
            const mesh = new THREE.Mesh(geometry, material.clone());
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.userData.isClothing = true; // Tag for dynamic OOTD color updates
            return mesh;
        };

        // --- SKELETON & BODY PARTS ASSEMBLY ---
        
        // A. HIPS & WAIST SASH
        // Root group (hips)
        const hipsGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.15, 16);
        this.skeletonRoot = createJoint("hips", hipsGeo, glazeAmber);
        this.skeletonRoot.position.set(0, 1.0, 0); // Position 1.0m above floor
        this.scene.add(this.skeletonRoot);
        
        // B. SPINE & CHEST (High-waisted robe bodice)
        const spine = createJoint("spine", new THREE.SphereGeometry(0.05, 12, 12), glazeAmber);
        spine.position.set(0, 0.16, 0);
        
        const spineRobe = createClothingSegment(
            new THREE.CylinderGeometry(0.1, 0.12, 0.16, 16),
            glazeCream
        );
        spineRobe.geometry.translate(0, -0.08, 0);
        this.skeletonRoot.add(spineRobe);
        this.skeletonRoot.add(spine);
        
        const chest = createJoint("chest", new THREE.SphereGeometry(0.05, 12, 12), glazeCream);
        chest.position.set(0, 0.16, 0);
        
        // High bodice top with cross-collar chest wrap detail
        const chestRobe = createClothingSegment(
            new THREE.CylinderGeometry(0.12, 0.1, 0.16, 16),
            glazeGreen
        );
        chestRobe.geometry.translate(0, -0.08, 0);
        spine.add(chestRobe);
        spine.add(chest);
        
        // C. NECK & HEAD WITH HAIR BUN
        const neck = createJoint("neck", new THREE.CylinderGeometry(0.03, 0.035, 0.08, 8), matteFace);
        neck.position.set(0, 0.08, 0);
        chest.add(neck);
        
        const head = new THREE.Group();
        // Face sphere
        const faceMesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), matteFace);
        faceMesh.position.set(0, 0.1, 0);
        faceMesh.castShadow = true;
        head.add(faceMesh);
        
        // Dedicated group to swap hair geometries on the fly
        this.hairGroup = new THREE.Group();
        head.add(this.hairGroup);
        this.rebuildHair("updo"); // Initialize with default Tang high bun
        
        this.joints["head"] = head;
        neck.add(head);

        // D. LEFT ARM & WIDE DRAPING SLEEVE
        const shoulderL = createJoint("shoulderL", new THREE.SphereGeometry(0.05, 12, 12), glazeGreen);
        shoulderL.position.set(0.18, 0.06, 0);
        chest.add(shoulderL);
        
        const upperArmL = createClothingSegment(
            new THREE.CylinderGeometry(0.04, 0.06, 0.22, 12),
            glazeCream
        );
        upperArmL.rotation.z = -Math.PI / 2;
        upperArmL.geometry.translate(0, -0.11, 0);
        shoulderL.add(upperArmL);
        
        const elbowL = createJoint("elbowL", new THREE.SphereGeometry(0.045, 12, 12), glazeCream);
        elbowL.position.set(0.22, 0, 0);
        shoulderL.add(elbowL);
        
        // Forearm with flared open sleeve hem
        const forearmL = createClothingSegment(
            new THREE.CylinderGeometry(0.06, 0.08, 0.2, 12),
            glazeGreen
        );
        forearmL.rotation.z = -Math.PI / 2;
        forearmL.geometry.translate(0, -0.1, 0);
        elbowL.add(forearmL);
        
        // Decorative sleeve drape hanging straight down from the forearm
        const sleeveDrapeL = createClothingSegment(
            new THREE.BoxGeometry(0.01, 0.25, 0.16),
            glazeGreen
        );
        sleeveDrapeL.position.set(0.1, -0.125, 0);
        elbowL.add(sleeveDrapeL);
        
        const wristL = createJoint("wristL", new THREE.SphereGeometry(0.03, 10, 10), matteFace);
        wristL.position.set(0.2, 0, 0);
        elbowL.add(wristL);

        // E. RIGHT ARM & WIDE DRAPING SLEEVE
        const shoulderR = createJoint("shoulderR", new THREE.SphereGeometry(0.05, 12, 12), glazeGreen);
        shoulderR.position.set(-0.18, 0.06, 0);
        chest.add(shoulderR);
        
        const upperArmR = createClothingSegment(
            new THREE.CylinderGeometry(0.04, 0.06, 0.22, 12),
            glazeCream
        );
        upperArmR.rotation.z = Math.PI / 2;
        upperArmR.geometry.translate(0, -0.11, 0);
        shoulderR.add(upperArmR);
        
        const elbowR = createJoint("elbowR", new THREE.SphereGeometry(0.045, 12, 12), glazeCream);
        elbowR.position.set(-0.22, 0, 0);
        shoulderR.add(elbowR);
        
        const forearmR = createClothingSegment(
            new THREE.CylinderGeometry(0.06, 0.08, 0.2, 12),
            glazeGreen
        );
        forearmR.rotation.z = Math.PI / 2;
        forearmR.geometry.translate(0, -0.1, 0);
        elbowR.add(forearmR);
        
        const sleeveDrapeR = createClothingSegment(
            new THREE.BoxGeometry(0.01, 0.25, 0.16),
            glazeGreen
        );
        sleeveDrapeR.position.set(-0.1, -0.125, 0);
        elbowR.add(sleeveDrapeR);
        
        const wristR = createJoint("wristR", new THREE.SphereGeometry(0.03, 10, 10), matteFace);
        wristR.position.set(-0.2, 0, 0);
        elbowR.add(wristR);

        // F. LEGS & FLOWING TANG SKIRT COLUMNS (Attached to thighs/calves to mimic skirt movement)
        const hipL = createJoint("hipL", new THREE.SphereGeometry(0.06, 12, 12), glazeAmber);
        hipL.position.set(0.08, -0.06, 0);
        this.skeletonRoot.add(hipL);
        
        const thighL = createClothingSegment(
            new THREE.CylinderGeometry(0.07, 0.12, 0.38, 16),
            glazeAmber
        );
        thighL.geometry.translate(0, -0.19, 0);
        hipL.add(thighL);
        this.thighL_mesh = thighL;
        
        const kneeL = createJoint("kneeL", new THREE.SphereGeometry(0.05, 12, 12), glazeAmber);
        kneeL.position.set(0, -0.38, 0);
        hipL.add(kneeL);
        
        const calfL = createClothingSegment(
            new THREE.CylinderGeometry(0.12, 0.16, 0.36, 16),
            glazeGreen
        );
        calfL.geometry.translate(0, -0.18, 0);
        kneeL.add(calfL);
        this.calfL_mesh = calfL;
        
        const ankleL = createJoint("ankleL", new THREE.BoxGeometry(0.06, 0.04, 0.1), glazeCream);
        ankleL.position.set(0, -0.36, 0.02);
        kneeL.add(ankleL);

        // RIGHT LEG
        const hipR = createJoint("hipR", new THREE.SphereGeometry(0.06, 12, 12), glazeAmber);
        hipR.position.set(-0.08, -0.06, 0);
        this.skeletonRoot.add(hipR);
        
        const thighR = createClothingSegment(
            new THREE.CylinderGeometry(0.07, 0.12, 0.38, 16),
            glazeAmber
        );
        thighR.geometry.translate(0, -0.19, 0);
        hipR.add(thighR);
        this.thighR_mesh = thighR;
        
        const kneeR = createJoint("kneeR", new THREE.SphereGeometry(0.05, 12, 12), glazeAmber);
        kneeR.position.set(0, -0.38, 0);
        hipR.add(kneeR);
        
        const calfR = createClothingSegment(
            new THREE.CylinderGeometry(0.12, 0.16, 0.36, 16),
            glazeGreen
        );
        calfR.geometry.translate(0, -0.18, 0);
        kneeR.add(calfR);
        this.calfR_mesh = calfR;
        
        const ankleR = createJoint("ankleR", new THREE.BoxGeometry(0.06, 0.04, 0.1), glazeCream);
        ankleR.position.set(0, -0.36, 0.02);
        kneeR.add(ankleR);
    }
    
    /**
     * Standard animation loop
     */
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Update procedurally driven state-based animations!
        this.updateAnimation();
        
        // Update Orbit Controls
        if (this.controls) this.controls.update();
        
        // Render
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }
    
    /**
     * Handles window resizing to keep aspect ratio
     */
    onWindowResize() {
        if (this.camera && this.renderer && this.canvas) {
            this.camera.aspect = this.canvas.clientWidth / this.canvas.clientHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        }
    }
    
    /**
     * Dynamically rebuild the hair mesh elements under this.hairGroup
     */
    rebuildHair(hairTag) {
        if (!this.hairGroup) return;

        // Clear existing hair meshes
        while (this.hairGroup.children.length > 0) {
            const child = this.hairGroup.children[0];
            if (child.geometry) child.geometry.dispose();
            this.hairGroup.remove(child);
        }

        const matteHair = new THREE.MeshStandardMaterial({
            color: 0x222222,
            roughness: 0.95,
            metalness: 0.05
        });

        // 1. Base hair skull cap (common to all styles)
        const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 16), matteHair);
        hairCap.scale.set(1.02, 1.02, 1.05);
        hairCap.position.set(0, 0.1, -0.01);
        hairCap.castShadow = true;
        this.hairGroup.add(hairCap);

        // Normalize tag text
        const tag = (hairTag || "").toLowerCase();

        if (tag.includes("丸子头") || tag.includes("盘发") || tag.includes("updo") || tag.includes("高髻")) {
            // Classic Tang high hair bun (高髻)
            const hairBase = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 16), matteHair);
            hairBase.position.set(0, 0.17, -0.02);
            hairBase.rotation.x = 0.2;
            hairBase.castShadow = true;
            this.hairGroup.add(hairBase);
            
            const topBun = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), matteHair);
            topBun.scale.set(1.0, 1.4, 0.7); // Tall flared bun
            topBun.position.set(0, 0.24, -0.03);
            topBun.castShadow = true;
            this.hairGroup.add(topBun);
        } else if (tag.includes("双马尾") || tag.includes("双髻") || tag.includes("twin") || tag.includes("丫髻")) {
            // Twin buns (双丫髻)
            const bunL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), matteHair);
            bunL.scale.set(0.8, 1.2, 0.8);
            bunL.position.set(0.08, 0.19, -0.02);
            bunL.rotation.z = -0.3;
            bunL.castShadow = true;
            this.hairGroup.add(bunL);
            
            const bunR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), matteHair);
            bunR.scale.set(0.8, 1.2, 0.8);
            bunR.position.set(-0.08, 0.19, -0.02);
            bunR.rotation.z = 0.3;
            bunR.castShadow = true;
            this.hairGroup.add(bunR);
        } else if (tag.includes("披肩") || tag.includes("披发") || tag.includes("draped") || tag.includes("long")) {
            // Cascading draping hair down the back
            const longHair = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.25, 0.04), matteHair);
            longHair.position.set(0, 0.0, -0.08);
            longHair.rotation.x = 0.1;
            longHair.castShadow = true;
            this.hairGroup.add(longHair);
        } else if (tag.includes("马尾") || tag.includes("pony")) {
            // Ponytail
            const ponyBase = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), matteHair);
            ponyBase.position.set(0, 0.18, -0.05);
            this.hairGroup.add(ponyBase);

            const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.01, 0.24, 8), matteHair);
            tail.position.set(0, 0.08, -0.12);
            tail.rotation.x = 0.5;
            tail.castShadow = true;
            this.hairGroup.add(tail);
        } else {
            // Default "短发" (short / cap only)
        }
    }

    /**
     * Rebuild skirt shape by updating geometry of thigh and calf meshes
     */
    rebuildSkirt(styleTag) {
        const tag = (styleTag || "").toLowerCase();

        let thighGeo, calfGeo;

        if (tag.includes("a型") || tag.includes("伞裙") || tag.includes("a-line") || tag.includes("宽")) {
            // Flared A-line skirt columns
            thighGeo = new THREE.CylinderGeometry(0.07, 0.12, 0.38, 16);
            calfGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.36, 16);
        } else if (tag.includes("h型") || tag.includes("直筒") || tag.includes("h-line") || tag.includes("褶裙")) {
            // Straight column dress
            thighGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.38, 16);
            calfGeo = new THREE.CylinderGeometry(0.09, 0.095, 0.36, 16);
        } else if (tag.includes("o型") || tag.includes("茧型") || tag.includes("o-line") || tag.includes("宽松")) {
            // Puffy cocoon dress
            thighGeo = new THREE.CylinderGeometry(0.08, 0.15, 0.38, 16);
            calfGeo = new THREE.CylinderGeometry(0.15, 0.08, 0.36, 16);
        } else {
            // Normal legs (for casual/tight styles)
            thighGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.38, 12);
            calfGeo = new THREE.CylinderGeometry(0.05, 0.045, 0.36, 12);
        }

        // Offset geometries to rotate around their top pivots correctly!
        thighGeo.translate(0, -0.19, 0);
        calfGeo.translate(0, -0.18, 0);

        // Swap geometries in-place!
        if (this.thighL_mesh) {
            this.thighL_mesh.geometry.dispose();
            this.thighL_mesh.geometry = thighGeo;
        }
        if (this.thighR_mesh) {
            this.thighR_mesh.geometry.dispose();
            this.thighR_mesh.geometry = thighGeo;
        }
        if (this.calfL_mesh) {
            this.calfL_mesh.geometry.dispose();
            this.calfL_mesh.geometry = calfGeo;
        }
        if (this.calfR_mesh) {
            this.calfR_mesh.geometry.dispose();
            this.calfR_mesh.geometry = calfGeo;
        }
    }

    /**
     * Unified entry point to update physical appearance/silhouette of the figurine
     */
    updateSilhouette(styleTag, hairTag) {
        console.log(`Updating avatar silhouette: Style=[${styleTag}], Hair=[${hairTag}]`);
        this.rebuildHair(hairTag);
        this.rebuildSkirt(styleTag);
    }

    /**
     * Rebuild avatar appearance to match the specific Sancai Figurine ID
     */
    updateFigurine(figurineId, userTags) {
        console.log(`[AvatarEngine] Rebuilding avatar to match figurine ID: ${figurineId}`);
        this.currentFigurineId = figurineId;
        
        // 1. Rebuild hair to match the matched figurine bun
        this.rebuildHairForFigurine(figurineId, userTags.hair);
        
        // 2. Rebuild skirt / robe shape
        this.rebuildSkirtForFigurine(figurineId, userTags.style);
        
        // 3. Rebuild accessories (held objects like flute, balls, etc.)
        this.rebuildAccessoriesForFigurine(figurineId);
    }

    /**
     * Rebuild hair structure based on figurine ID
     */
    rebuildHairForFigurine(figurineId, fallbackHairTag) {
        if (!this.hairGroup) return;

        // Clear existing hair meshes
        while (this.hairGroup.children.length > 0) {
            const child = this.hairGroup.children[0];
            if (child.geometry) child.geometry.dispose();
            this.hairGroup.remove(child);
        }

        const matteHair = new THREE.MeshStandardMaterial({
            color: 0x222222,
            roughness: 0.95,
            metalness: 0.05
        });

        // Base hair skull cap (common to all styles)
        const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 16), matteHair);
        hairCap.scale.set(1.02, 1.02, 1.05);
        hairCap.position.set(0, 0.1, -0.01);
        hairCap.castShadow = true;
        this.hairGroup.add(hairCap);

        const fid = (figurineId || "").toLowerCase();

        if (fid === "optimal_1") {
            // Twin broad flat side buns (伞裙乐人 style)
            const bunL = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12), matteHair);
            bunL.scale.set(1.2, 0.65, 0.85);
            bunL.position.set(0.12, 0.12, -0.01);
            bunL.rotation.z = -0.4;
            bunL.castShadow = true;
            this.hairGroup.add(bunL);

            const bunR = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12), matteHair);
            bunR.scale.set(1.2, 0.65, 0.85);
            bunR.position.set(-0.12, 0.12, -0.01);
            bunR.rotation.z = 0.4;
            bunR.castShadow = true;
            this.hairGroup.add(bunR);
        } else if (fid === "optimal_2") {
            // Twin buns on top/sides (茧型立俑)
            const bunL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), matteHair);
            bunL.scale.set(0.95, 1.3, 0.95);
            bunL.position.set(0.08, 0.19, -0.02);
            bunL.rotation.z = -0.3;
            bunL.castShadow = true;
            this.hairGroup.add(bunL);
            
            const bunR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), matteHair);
            bunR.scale.set(0.95, 1.3, 0.95);
            bunR.position.set(-0.08, 0.19, -0.02);
            bunR.rotation.z = 0.3;
            bunR.castShadow = true;
            this.hairGroup.add(bunR);
        } else if (fid === "optimal_3") {
            // Tall double-loop hair bun (双环望仙髻)
            const loopL = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.018, 8, 24), matteHair);
            loopL.scale.set(1.0, 1.4, 0.7);
            loopL.position.set(0.035, 0.22, -0.03);
            loopL.rotation.y = 0.2;
            loopL.castShadow = true;
            this.hairGroup.add(loopL);

            const loopR = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.018, 8, 24), matteHair);
            loopR.scale.set(1.0, 1.4, 0.7);
            loopR.position.set(-0.035, 0.22, -0.03);
            loopR.rotation.y = -0.2;
            loopR.castShadow = true;
            this.hairGroup.add(loopR);
        } else if (fid === "optimal_4") {
            // Tilted high bun
            const topBun = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 12), matteHair);
            topBun.scale.set(0.85, 1.4, 0.85);
            topBun.position.set(0.04, 0.23, -0.04);
            topBun.rotation.z = -0.25;
            topBun.castShadow = true;
            this.hairGroup.add(topBun);
        } else {
            // Fallback to standard hair tag rebuilding
            this.rebuildHair(fallbackHairTag);
        }
    }

    /**
     * Rebuild skirt shape to match the specific matched figurine's visual look
     */
    rebuildSkirtForFigurine(figurineId, fallbackStyleTag) {
        // 1. Clean up old custom skirt mesh
        if (this.skirtMesh) {
            this.skeletonRoot.remove(this.skirtMesh);
            this.skirtMesh.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                    else child.material.dispose();
                }
            });
            this.skirtMesh = null;
        }

        // Helpers to control the default thighs/calves
        const setLegsVisibilityAndMaterial = (scale, mat) => {
            if (this.thighL_mesh) {
                this.thighL_mesh.scale.set(scale.x, scale.y, scale.z);
                if (mat) this.thighL_mesh.material = mat;
            }
            if (this.thighR_mesh) {
                this.thighR_mesh.scale.set(scale.x, scale.y, scale.z);
                if (mat) this.thighR_mesh.material = mat;
            }
            if (this.calfL_mesh) {
                this.calfL_mesh.scale.set(scale.x, scale.y, scale.z);
                if (mat) this.calfL_mesh.material = mat;
            }
            if (this.calfR_mesh) {
                this.calfR_mesh.scale.set(scale.x, scale.y, scale.z);
                if (mat) this.calfR_mesh.material = mat;
            }
        };

        const glazeGreen = new THREE.MeshPhysicalMaterial({
            color: 0x2e7d32, roughness: 0.15, metalness: 0.1, clearcoat: 1.0
        });
        const glazeAmber = new THREE.MeshPhysicalMaterial({
            color: 0xffa000, roughness: 0.15, metalness: 0.1, clearcoat: 1.0
        });
        const glazeCream = new THREE.MeshPhysicalMaterial({
            color: 0xfffdd0, roughness: 0.15, metalness: 0.1, clearcoat: 1.0
        });

        const fid = (figurineId || "").toLowerCase();

        if (fid === "optimal_1") {
            // --- 伞裙乐人: Giant Flat Saucer/Umbrella Gown ---
            this.skirtMesh = new THREE.Group();

            // Upper skirt bodice transition
            const upperSkirt = new THREE.Mesh(
                new THREE.CylinderGeometry(0.12, 0.22, 0.28, 24),
                glazeCream.clone()
            );
            upperSkirt.position.set(0, -0.14, 0);
            upperSkirt.castShadow = true;
            upperSkirt.receiveShadow = true;
            upperSkirt.userData.isClothing = true;
            this.skirtMesh.add(upperSkirt);

            // Giant flat circular disc (umbrella)
            const umbrellaDisc = new THREE.Mesh(
                new THREE.CylinderGeometry(0.22, 0.70, 0.16, 32),
                glazeGreen.clone()
            );
            umbrellaDisc.position.set(0, -0.36, 0);
            umbrellaDisc.castShadow = true;
            umbrellaDisc.receiveShadow = true;
            umbrellaDisc.userData.isClothing = true;
            this.skirtMesh.add(umbrellaDisc);

            // Lower skirt cylinder poking out of umbrella
            const lowerSkirt = new THREE.Mesh(
                new THREE.CylinderGeometry(0.32, 0.42, 0.26, 24),
                glazeAmber.clone()
            );
            lowerSkirt.position.set(0, -0.57, 0);
            lowerSkirt.castShadow = true;
            lowerSkirt.receiveShadow = true;
            lowerSkirt.userData.isClothing = true;
            this.skirtMesh.add(lowerSkirt);

            this.skeletonRoot.add(this.skirtMesh);

            // Hide the default thick leg columns
            setLegsVisibilityAndMaterial(new THREE.Vector3(0.01, 0.01, 0.01), null);

        } else if (fid === "optimal_2") {
            // --- 茧型立俑: Spherical/Cocoon Pumpkin Skirt + Thin leggings exposed ---
            this.skirtMesh = new THREE.Group();

            const cocoon = new THREE.Mesh(
                new THREE.SphereGeometry(0.33, 32, 32),
                glazeCream.clone()
            );
            cocoon.scale.set(1.0, 1.25, 0.88);
            cocoon.position.set(0, -0.32, 0);
            cocoon.castShadow = true;
            cocoon.receiveShadow = true;
            cocoon.userData.isClothing = true;
            this.skirtMesh.add(cocoon);

            // Let's add some decorative Sancai Amber belt stripes around the cocoon
            const belt = new THREE.Mesh(
                new THREE.CylinderGeometry(0.332, 0.332, 0.04, 24),
                glazeAmber.clone()
            );
            belt.position.set(0, -0.15, 0);
            belt.userData.isClothing = true;
            this.skirtMesh.add(belt);

            this.skeletonRoot.add(this.skirtMesh);

            // The legs are exposed in the cocoon design!
            // Make default leg segments thin & white (matching the leggings in CAFA original art)
            setLegsVisibilityAndMaterial(new THREE.Vector3(0.45, 1.0, 0.45), glazeCream);

        } else if (fid === "optimal_3") {
            // --- 微澜仕女: Multi-Bumpy Bubble Skirt ---
            this.skirtMesh = new THREE.Group();

            // Base flared skirt
            const baseSkirt = new THREE.Mesh(
                new THREE.CylinderGeometry(0.12, 0.38, 0.62, 24),
                glazeGreen.clone()
            );
            baseSkirt.position.set(0, -0.31, 0);
            baseSkirt.castShadow = true;
            baseSkirt.receiveShadow = true;
            baseSkirt.userData.isClothing = true;
            this.skirtMesh.add(baseSkirt);

            // Generate multi-colored bubble rows around the skirt surface!
            // Sancai Ceramic bubble colors
            const bubbleMaterials = [
                glazeAmber.clone(),
                glazeGreen.clone(),
                glazeCream.clone()
            ];

            const rows = [
                { y: -0.50, r: 0.33, count: 10 },
                { y: -0.38, r: 0.27, count: 8 },
                { y: -0.26, r: 0.20, count: 6 }
            ];

            rows.forEach((row, rowIndex) => {
                for (let i = 0; i < row.count; i++) {
                    const theta = (i / row.count) * Math.PI * 2;
                    const bubble = new THREE.Mesh(
                        new THREE.SphereGeometry(0.045, 12, 12),
                        bubbleMaterials[(i + rowIndex) % 3] // beautiful pattern
                    );
                    bubble.position.set(
                        row.r * Math.sin(theta),
                        row.y,
                        row.r * Math.cos(theta)
                    );
                    bubble.castShadow = true;
                    bubble.userData.isClothing = true;
                    bubble.userData.ignorePaletteUpdate = true; // Retain their Sancai colorful glaze!
                    this.skirtMesh.add(bubble);
                }
            });

            this.skeletonRoot.add(this.skirtMesh);

            // Hide the default leg columns
            setLegsVisibilityAndMaterial(new THREE.Vector3(0.01, 0.01, 0.01), null);

        } else if (fid === "optimal_4") {
            // --- 碎花乐伎: Flowing Straight-Line Robe ---
            this.skirtMesh = new THREE.Group();

            // Upper hips wrap
            const upperSkirt = new THREE.Mesh(
                new THREE.CylinderGeometry(0.12, 0.15, 0.22, 24),
                glazeAmber.clone()
            );
            upperSkirt.position.set(0, -0.11, 0);
            upperSkirt.castShadow = true;
            upperSkirt.receiveShadow = true;
            upperSkirt.userData.isClothing = true;
            this.skirtMesh.add(upperSkirt);

            // Long flowing lower robe
            const lowerSkirt = new THREE.Mesh(
                new THREE.CylinderGeometry(0.15, 0.30, 0.52, 24),
                glazeGreen.clone()
            );
            lowerSkirt.position.set(0, -0.48, 0);
            lowerSkirt.castShadow = true;
            lowerSkirt.receiveShadow = true;
            lowerSkirt.userData.isClothing = true;
            this.skirtMesh.add(lowerSkirt);

            this.skeletonRoot.add(this.skirtMesh);

            // Hide the default leg columns
            setLegsVisibilityAndMaterial(new THREE.Vector3(0.01, 0.01, 0.01), null);

        } else {
            // Fallback: Restore default legs visibility and call standard rebuild
            setLegsVisibilityAndMaterial(new THREE.Vector3(1, 1, 1), null);
            this.rebuildSkirt(fallbackStyleTag);
        }
    }

    /**
     * Attach custom accessory objects to wrists (e.g. flute, juggling balls)
     */
    rebuildAccessoriesForFigurine(figurineId) {
        // 1. Clean up old accessories
        if (this.accessories) {
            this.accessories.forEach((acc) => {
                if (acc.parent) acc.parent.remove(acc);
                if (acc.geometry) acc.geometry.dispose();
                if (acc.material) acc.material.dispose();
            });
            this.accessories = [];
        } else {
            this.accessories = [];
        }

        const fid = (figurineId || "").toLowerCase();

        if (fid === "optimal_1") {
            // --- Flute (Cylinder) attached to right wrist ---
            const fluteGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.46, 12);
            const fluteMat = new THREE.MeshPhysicalMaterial({
                color: 0x1b5e20, roughness: 0.15, metalness: 0.1, clearcoat: 1.0
            });
            const flute = new THREE.Mesh(fluteGeo, fluteMat);
            
            // Position flute to align with hand pivot
            flute.position.set(0.05, 0.06, 0.04);
            flute.rotation.set(Math.PI / 3, 0, Math.PI / 4);
            flute.castShadow = true;
            flute.userData.ignorePaletteUpdate = true; // Maintain dark jade flute color

            if (this.joints["wristR"]) {
                this.joints["wristR"].add(flute);
                this.accessories.push(flute);
            }

        } else if (fid === "optimal_4") {
            // --- Juggling Balls (Purple on Left, Amber/Red on Right wrist) ---
            const ballLGeo = new THREE.SphereGeometry(0.125, 24, 24);
            const ballLMat = new THREE.MeshPhysicalMaterial({
                color: 0x4a148c, roughness: 0.1, metalness: 0.15, clearcoat: 1.0 // Purple
            });
            const ballL = new THREE.Mesh(ballLGeo, ballLMat);
            ballL.position.set(0.04, 0.06, 0);
            ballL.castShadow = true;
            ballL.userData.ignorePaletteUpdate = true;

            const ballRGeo = new THREE.SphereGeometry(0.135, 24, 24);
            const ballRMat = new THREE.MeshPhysicalMaterial({
                color: 0xff6d00, roughness: 0.1, metalness: 0.15, clearcoat: 1.0 // Amber/Orange
            });
            const ballR = new THREE.Mesh(ballRGeo, ballRMat);
            ballR.position.set(-0.04, 0.06, 0);
            ballR.castShadow = true;
            ballR.userData.ignorePaletteUpdate = true;

            if (this.joints["wristL"]) {
                this.joints["wristL"].add(ballL);
                this.accessories.push(ballL);
            }
            if (this.joints["wristR"]) {
                this.joints["wristR"].add(ballR);
                this.accessories.push(ballR);
            }
        }
    }
    
    /**
     * Triggers a specific pre-animated classical dance based on matched pose
     */
    triggerDance(poseKey) {
        console.log(`[AvatarEngine] Triggering dance performance: ${poseKey}`);
        this.danceStartTime = Date.now();
        
        if (poseKey === 'sleeve') {
            this.animationState = 'DANCE_SLEEVE';
        } else if (poseKey === 'lute') {
            this.animationState = 'DANCE_LUTE';
        } else if (poseKey === 'pointer') {
            this.animationState = 'DANCE_POINTER';
        }
    }

    /**
     * Resets avatar back to idle state
     */
    resetToIdle() {
        this.animationState = 'IDLE';
        this.danceStartTime = 0;
        console.log("[AvatarEngine] Returned to idle state.");
    }

    /**
     * The Procedural Animation Engine:
     * Evaluates active state, calculates target joint rotations using mathematical functions,
     * and performs smooth Slerp transitions to prevent jitter and pop.
     */
    updateAnimation() {
        if (!this.joints || Object.keys(this.joints).length === 0) return;

        const now = Date.now();
        const time = now * 0.001; // Current time in seconds

        // 1. Check if the active dance has finished and needs to return to IDLE
        if (this.animationState !== 'IDLE' && this.danceStartTime > 0) {
            const elapsed = now - this.danceStartTime;
            if (elapsed >= this.danceDuration) {
                this.resetToIdle();
                
                // Fire window callback to let the frontend know the dance is complete!
                if (typeof window.onDanceComplete === 'function') {
                    window.onDanceComplete();
                }
            }
        }

        // 2. Initialize target rotations for all joints to Identity (no rotation)
        const targets = {};
        for (let name in this.joints) {
            targets[name] = new THREE.Quaternion(); // Identity
        }

        // Hips default position
        let hipsTargetY = 1.0;
        let hipsTargetX = 0.0;

        // 3. Compute target orientations based on the active state
        if (this.animationState === 'IDLE') {
            // === IDLE: Gentle Breathing & Swaying ===
            hipsTargetY = 1.0 + Math.sin(time * 1.5) * 0.012; // breathing
            
            // Gentle spine sway
            targets["spine"].setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.sin(time * 0.8) * 0.02);
            
            // Arms relaxed near sides
            // Left arm
            targets["shoulderL"].setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2.3 + Math.sin(time * 1.0) * 0.03));
            targets["elbowL"].setFromEuler(new THREE.Euler(0, -Math.PI / 4, 0));
            
            // Right arm
            targets["shoulderR"].setFromEuler(new THREE.Euler(0, 0, Math.PI / 2.3 - Math.sin(time * 1.0) * 0.03));
            targets["elbowR"].setFromEuler(new THREE.Euler(0, Math.PI / 4, 0));

        } else if (this.animationState === 'DANCE_SLEEVE') {
            // === DANCE_SLEEVE: Dynamic flowing sleeves dance ===
            hipsTargetY = 1.0 + Math.sin(time * 2.8) * 0.03; // bouncing rhythm
            hipsTargetX = Math.sin(time * 1.4) * 0.06;
            
            // Spine figure-8 sway
            targets["spine"].setFromEuler(new THREE.Euler(
                Math.cos(time * 1.4) * 0.12,
                Math.sin(time * 0.7) * 0.18,
                Math.sin(time * 1.4) * 0.15
            ));
            
            // Dynamic sleeve waving (Large movements)
            const waveL = -Math.PI / 3.2 + Math.sin(time * 2.5) * 0.45;
            const swingL = Math.cos(time * 1.25) * 0.35;
            targets["shoulderL"].setFromEuler(new THREE.Euler(swingL, 0, waveL));
            targets["elbowL"].setFromEuler(new THREE.Euler(0, -Math.PI / 4 + Math.sin(time * 2.5) * 0.25, 0));
            targets["wristL"].setFromEuler(new THREE.Euler(0, Math.sin(time * 3.5) * 0.4, 0));

            const waveR = Math.PI / 3.2 + Math.cos(time * 2.5) * 0.45;
            const swingR = Math.sin(time * 1.25) * 0.35;
            targets["shoulderR"].setFromEuler(new THREE.Euler(swingR, 0, waveR));
            targets["elbowR"].setFromEuler(new THREE.Euler(0, Math.PI / 4 + Math.cos(time * 2.5) * 0.25, 0));
            targets["wristR"].setFromEuler(new THREE.Euler(0, Math.cos(time * 3.5) * 0.4, 0));

        } else if (this.animationState === 'DANCE_LUTE') {
            // === DANCE_LUTE: Elegant S-Curve Dunhuang Lute Dance ===
            hipsTargetY = 0.96 + Math.sin(time * 2.0) * 0.015;
            hipsTargetX = Math.sin(time * 2.0) * 0.08; // hip sway
            
            // Spine leaning S-curve
            targets["spine"].setFromEuler(new THREE.Euler(
                0.05,
                Math.cos(time * 1.0) * 0.15,
                -0.12 + Math.sin(time * 2.0) * 0.08
            ));

            // Right arm playing lute behind head
            targets["shoulderR"].setFromEuler(new THREE.Euler(
                Math.PI / 1.6, // rotated backward/upward
                0,
                Math.PI / 3.5 + Math.sin(time * 3.5) * 0.08
            ));
            // Strumming motion at right elbow
            targets["elbowR"].setFromEuler(new THREE.Euler(
                0,
                Math.PI / 2.2 + Math.cos(time * 4.5) * 0.25,
                0
            ));

            // Left arm extended out holding lute neck
            targets["shoulderL"].setFromEuler(new THREE.Euler(-Math.PI / 4, 0, -Math.PI / 2.5));
            targets["elbowL"].setFromEuler(new THREE.Euler(0, -Math.PI / 6 + Math.sin(time * 2) * 0.1, 0));

        } else if (this.animationState === 'DANCE_POINTER') {
            // === DANCE_POINTER: Elegant Flute Playing Sway ===
            hipsTargetY = 1.0 + Math.sin(time * 1.4) * 0.008;
            
            // Soft sway
            targets["spine"].setFromEuler(new THREE.Euler(
                0,
                Math.sin(time * 0.7) * 0.10,
                Math.sin(time * 1.4) * 0.08
            ));

            // Both hands positioned in front of face to hold and play the flute!
            const fluteBreath = Math.sin(time * 1.8) * 0.03;
            
            // Left hand
            targets["shoulderL"].setFromEuler(new THREE.Euler(
                Math.PI / 3.4,
                Math.PI / 6.5,
                -Math.PI / 4.2 + fluteBreath
            ));
            targets["elbowL"].setFromEuler(new THREE.Euler(0, -Math.PI / 2.4, 0));

            // Right hand
            targets["shoulderR"].setFromEuler(new THREE.Euler(
                Math.PI / 3.4,
                -Math.PI / 6.5,
                Math.PI / 4.2 + fluteBreath
            ));
            targets["elbowR"].setFromEuler(new THREE.Euler(0, Math.PI / 2.4, 0));
        }

        // 4. Apply calculated target rotations smoothly to Three.js joints using Slerp!
        const lerpFactor = this.animationState === 'IDLE' ? 0.05 : 0.08; // slightly faster transitions for dancing
        for (let name in this.joints) {
            if (targets[name]) {
                this.joints[name].quaternion.slerp(targets[name], lerpFactor);
            }
        }

        // Apply hip position changes smoothly
        if (this.skeletonRoot) {
            this.skeletonRoot.position.y = THREE.MathUtils.lerp(this.skeletonRoot.position.y, hipsTargetY, 0.08);
            this.skeletonRoot.position.x = THREE.MathUtils.lerp(this.skeletonRoot.position.x, hipsTargetX, 0.08);
        }
    }

    /**
     * Clean up memory
     */
    destroy() {
        if (this.renderer) {
            this.renderer.dispose();
        }
        window.removeEventListener('resize', () => this.onWindowResize());
    }
}
