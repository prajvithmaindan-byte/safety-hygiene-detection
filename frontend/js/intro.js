/**
 * HygieneGuard Premium 3D Particle Spiral Intro Engine
 * Implements full-screen perspective helix vortex particles and cyberpunk boot sequence.
 */

(function () {
  const splash = document.getElementById("introSplash");
  const canvas = document.getElementById("introCanvas");
  const loaderBar = document.getElementById("introLoaderBar");
  const statusTxt = document.getElementById("introStatus");

  if (!splash || !canvas) return;

  const ctx = canvas.getContext("2d");
  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);
  const fov = 400; // Perspective FOV depth field

  window.addEventListener("resize", () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  // Particle Class for Cylindrical Helical Vortex
  class HelixParticle {
    constructor() {
      this.reset(true);
      // Distribute depths along z-axis to start
      this.z = Math.random() * 800;
    }

    reset(init = false) {
      // Cylindrical helix spiral coordinates
      this.theta = Math.random() * Math.PI * 2;
      this.baseRadius = Math.random() * 250 + 80;
      this.radius = this.baseRadius;
      this.z = init ? Math.random() * 800 : 800; // spawn in deep background

      // Spiral speeds
      this.speedTheta = Math.random() * 0.015 + 0.006; // spiral rotation speed
      this.speedRadius = Math.random() * 0.6 + 0.2;  // radial contraction speed
      this.speedZ = Math.random() * 2.2 + 1.2;       // depth forward travel speed

      // Stagger colors matching the HygieneGuard HUD theme
      const rand = Math.random();
      if (rand > 0.65) {
        this.color = "0, 255, 136"; // Neon Green
      } else if (rand > 0.3) {
        this.color = "0, 242, 254"; // Neon Cyan
      } else {
        this.color = "255, 0, 127"; // Cyber Magenta
      }
    }

    update() {
      this.theta += this.speedTheta;
      this.radius -= this.speedRadius;
      this.z -= this.speedZ;

      // Respawn when drawn past camera plane or fully contracted
      if (this.radius <= 5 || this.z <= -150) {
        this.reset(false);
      }
    }

    project() {
      // Cylindrical to 3D Cartesian coordinates
      // Wave modifier adds elegant organic ripple/oscillation to the spiral arm
      const x3d = Math.cos(this.theta) * this.radius;
      const y3d = Math.sin(this.theta) * this.radius + Math.sin(this.theta * 1.5) * 12;

      // 3D Perspective Projection Formulas
      const scale = fov / (fov + this.z);
      this.sx = width / 2 + x3d * scale;
      this.sy = height / 2 + y3d * scale;
      this.size = Math.max(0.6, (Math.random() * 1.4 + 0.8) * scale * 2.0);

      // Smooth depth fading boundaries
      let alpha = 1.0;
      if (this.z < 0) {
        alpha = (150 + this.z) / 150; // Fade out as it passes behind camera
      } else if (this.z > 600) {
        alpha = (800 - this.z) / 200; // Fade in as it emerges in background
      }
      this.alpha = Math.max(0, Math.min(1, alpha));
    }
  }

  // Create particle pool
  const numParticles = 280;
  const particles = [];
  for (let i = 0; i < numParticles; i++) {
    particles.push(new HelixParticle());
  }

  // Animation Loop
  function animate() {
    if (splash.classList.contains("fade-out")) return; // halt when finished

    // Motion blur clear
    ctx.fillStyle = "rgba(6, 8, 12, 0.18)";
    ctx.fillRect(0, 0, width, height);

    // Update and project all nodes
    particles.forEach((p) => {
      p.update();
      p.project();
    });

    // 1. Render Connected Filament Webs (Helical grid meshes)
    // Draw connections between neighboring elements in the array to make helix lines
    for (let i = 0; i < numParticles - 3; i++) {
      const p1 = particles[i];
      const p2 = particles[i + 3]; // web link spacing

      const dist2d = Math.hypot(p1.sx - p2.sx, p1.sy - p2.sy);
      // Only draw links if they are within standard neighborhood distance and depth matching
      if (dist2d < 120 && Math.abs(p1.z - p2.z) < 180) {
        const opacity = Math.min(p1.alpha, p2.alpha) * 0.12 * (1 - dist2d / 120);
        ctx.strokeStyle = `rgba(0, 242, 254, ${opacity})`;
        ctx.lineWidth = 0.55;
        ctx.beginPath();
        ctx.moveTo(p1.sx, p1.sy);
        ctx.lineTo(p2.sx, p2.sy);
        ctx.stroke();
      }
    }

    // 2. Draw active glowing particle centers
    particles.forEach((p) => {
      ctx.fillStyle = `rgba(${p.color}, ${p.alpha * 0.8})`;
      ctx.shadowColor = `rgb(${p.color})`;
      ctx.shadowBlur = p.alpha > 0.5 ? 5 : 0;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.shadowBlur = 0; // Reset canvas shadow state

    requestAnimationFrame(animate);
  }

  // Launch 3D Spiral Render Loop
  requestAnimationFrame(animate);

  // Simulated Boot Progress Sequencing
  let progress = 0;
  const totalDuration = 4500; // 4.5 seconds loading loop
  const intervalTime = 40;
  const incrementStep = (intervalTime / totalDuration) * 100;

  const bootLogs = [
    { threshold: 0, text: "⬡ INITIATING HYGIENEGUARD CORE DISCOVERY..." },
    { threshold: 22, text: "⬡ ESTABLISHING ENCRYPTED CAMERA HANDSHAKE..." },
    { threshold: 46, text: "⬡ LOADING DEEP TENSOR DETECTOR AXIOM WEIGHTS..." },
    { threshold: 68, text: "⬡ CALIBRATING COMPLIANCE TELEMETRY CALC ENGINE..." },
    { threshold: 88, text: "⬡ SECURING PERIMETER ACTIVE SHIELD GUARDIAN..." },
    { threshold: 97, text: "✓ SYSTEM READY. HANDOVER DISCOVERY INITIATED." }
  ];

  const progressInterval = setInterval(() => {
    progress += incrementStep;
    if (progress >= 100) {
      progress = 100;
      clearInterval(progressInterval);
      completeIntro();
    }

    // Update loader UI
    loaderBar.style.width = `${progress}%`;

    // Retrieve corresponding boot status string
    let currentLog = bootLogs[0].text;
    for (let i = 0; i < bootLogs.length; i++) {
      if (progress >= bootLogs[i].threshold) {
        currentLog = bootLogs[i].text;
      }
    }
    statusTxt.innerText = currentLog;
  }, intervalTime);

  // Smooth Fade-out Exit Transition
  function completeIntro() {
    clearInterval(progressInterval);
    splash.classList.add("fade-out");
    setTimeout(() => {
      splash.remove(); // discard from DOM to free GPU resources
    }, 1000);
  }

  // Bind global skip hook
  window.skipIntro = function () {
    completeIntro();
  };
})();
