jQuery(document).ready(function ($) {

    const particlesContainer = $("#particles");
    if (!particlesContainer.length) {
      console.warn("#particles div not found!");
      return;
    }
  
    const canvas = document.createElement("canvas");
    particlesContainer.append(canvas);
  
    // Initialize Three.js components
    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      canvas: canvas,
    });
  
    if(window.innerWidth < 670) {
      renderer.setSize(1000, 200); // Set to 400px wide and 200px tall
    } else {
      renderer.setSize(particlesContainer.width(), particlesContainer.height()); // Default sizes
    }

    const camera = new THREE.PerspectiveCamera(
      20,
      particlesContainer.width() / particlesContainer.height(),
      1,
      100
    );
  
    camera.position.set(-1.07, -1.79, -0.08);
    camera.rotation.set(1.72, -0.54, 3.14);
  
    // Uniforms for shaders
    const uniforms = {
      u_time: { value: 0.0 },
      u_pointsize: { value: 1.0 },
      u_noise_freq_1: { value: 1.5 },
      u_noise_amp_1: { value: 0.2 },
      u_spd_modifier_1: { value: 1.0 },
      u_noise_freq_2: { value: 2.0 },
      u_noise_amp_2: { value: 0.3 },
      u_spd_modifier_2: { value: 0.8 },
      u_resolution: { value: new THREE.Vector2(particlesContainer.width(), particlesContainer.height()) },
      u_start_color: { value: new THREE.Color(0x15e1d5) }, 
      u_end_color: { value: new THREE.Color(0x5ee1ff) },
    };
  
    // Vertex Shader
    const vertexShader = `
      #define PI 3.14159265359
  
      uniform float u_time;
      uniform float u_pointsize;
      uniform float u_noise_amp_1;
      uniform float u_noise_freq_1;
      uniform float u_spd_modifier_1;
      uniform float u_noise_amp_2;
      uniform float u_noise_freq_2;
      uniform float u_spd_modifier_2;
  
      float random(in vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
      }
  
      float noise(in vec2 st) {
        vec2 i = floor(st);
        vec2 f = fract(st);
  
        float a = random(i);
        float b = random(i + vec2(1.0, 0.0));
        float c = random(i + vec2(0.0, 1.0));
        float d = random(i + vec2(1.0, 1.0));
  
        vec2 u = f * f * (3.0 - 2.0 * f);
  
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }
  
      mat2 rotate2d(float angle) {
        return mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
      }
  
      void main() {
        gl_PointSize = u_pointsize;
  
        vec3 pos = position;
        pos.z += noise(pos.xy * u_noise_freq_1 + u_time * u_spd_modifier_1) * u_noise_amp_1;
        pos.z += noise(rotate2d(PI / 4.0) * pos.yx * u_noise_freq_2 - u_time * u_spd_modifier_2 * 0.6) * u_noise_amp_2;
  
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `;
  
    // Fragment Shader
    const fragmentShader = `
      #ifdef GL_ES
      precision mediump float;
      #endif
  
      uniform vec3 u_start_color;
      uniform vec3 u_end_color;
      uniform vec2 u_resolution;
  
      void main() {
        vec2 st = gl_FragCoord.xy / u_resolution.xy;
  
        // Use horizontal position (X) for blending
        float blendFactor = clamp(st.x, 0.0, 1.0);
  
        // Blend colors based on horizontal position
        vec3 color = mix(u_start_color, u_end_color, blendFactor);
  
        gl_FragColor = vec4(color, 1.0);
      }
    `;
  
    // Geometry and Material
    const geometry = new THREE.PlaneGeometry(4, 4, 128, 128);
    const material = new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
    });
    const mesh = new THREE.Points(geometry, material);
    scene.add(mesh);
  
    // Animation Loop
    const clock = new THREE.Clock();
    function animate() {
      uniforms.u_time.value = clock.getElapsedTime();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }
  
    // Smoothly interpolate values
    function lerp(start, end, t) {
      return start + (end - start) * t;
    }
  
    // Target uniforms for smooth transitions
    let targetUniforms = {
      u_noise_freq_1: uniforms.u_noise_freq_1.value,
      u_noise_amp_1: uniforms.u_noise_amp_1.value,
      u_spd_modifier_1: uniforms.u_spd_modifier_1.value,
      u_noise_freq_2: uniforms.u_noise_freq_2.value,
      u_noise_amp_2: uniforms.u_noise_amp_2.value,
      u_spd_modifier_2: uniforms.u_spd_modifier_2.value,
      u_start_color: uniforms.u_start_color.value.clone(),
      u_end_color: uniforms.u_end_color.value.clone(),
    };
  
    function updateWaveParameters() {
      uniforms.u_noise_freq_1.value = lerp(uniforms.u_noise_freq_1.value, targetUniforms.u_noise_freq_1, 0.05);
      uniforms.u_noise_amp_1.value = lerp(uniforms.u_noise_amp_1.value, targetUniforms.u_noise_amp_1, 0.05);
      uniforms.u_spd_modifier_1.value = lerp(uniforms.u_spd_modifier_1.value, targetUniforms.u_spd_modifier_1, 0.05);
      uniforms.u_noise_freq_2.value = lerp(uniforms.u_noise_freq_2.value, targetUniforms.u_noise_freq_2, 0.05);
      uniforms.u_noise_amp_2.value = lerp(uniforms.u_noise_amp_2.value, targetUniforms.u_noise_amp_2, 0.05);
      uniforms.u_spd_modifier_2.value = lerp(uniforms.u_spd_modifier_2.value, targetUniforms.u_spd_modifier_2, 0.05);
  
      // Smoothly interpolate colors
      uniforms.u_start_color.value.lerp(targetUniforms.u_start_color, 0.05);
      uniforms.u_end_color.value.lerp(targetUniforms.u_end_color, 0.05);
  
      requestAnimationFrame(updateWaveParameters);

    }
  
    // Listen for the custom event to update wave
    window.addEventListener('updateWave', (event) => {

      const { startColor, endColor, emotion, intensity } = event.detail;

      // Set start and end colors
      targetUniforms.u_start_color = new THREE.Color(startColor);
      targetUniforms.u_end_color = new THREE.Color(endColor);

      targetUniforms.u_noise_freq_1 = 2.2 + (intensity * 0.1); 
      targetUniforms.u_noise_amp_1 = 0.2 + (intensity * 0.01);

      targetUniforms.u_noise_freq_2 = 2.2 + (intensity * 0.1); 
      targetUniforms.u_noise_amp_2 = 0.2 + (intensity * 0.01);

    });
    
    animate();
    updateWaveParameters();

	window.onresize = function() {

		animate();
		updateWaveParameters();

	}	

});

  jQuery(document).ready(function ($) {
    const sphereContainer = $("#sphere");
    if (!sphereContainer.length) {
      console.warn("#sphere div not found!");
      return;
    }
  
    // Set up renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

    if(window.innerWidth < 670) {
      renderer.setSize(500, 500); // Set to 400px wide and 200px tall
    } else {
      renderer.setSize(sphereContainer.width(), sphereContainer.height()); // Default sizes
    }

    renderer.setSize(sphereContainer.width(), sphereContainer.height());
    renderer.setClearColor(0x000000, 0); // Transparent background
    sphereContainer.append(renderer.domElement);
  
    // Set up scene and camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      60,
      sphereContainer.width() / sphereContainer.height(),
      1,
      1000
    );
    camera.position.set(0, 0, 15);
  
    // Create SphereBufferGeometry directly
    const geometry = new THREE.SphereBufferGeometry(7, 10, 10); // Modern `SphereBufferGeometry`
  
    // Check if position attribute exists
    if (!geometry.attributes || !geometry.attributes.position) {
      console.error("Position attribute is missing on geometry!");
      return;
    }
  
    // Add gradient colors directly based on X position (left-to-right)
    const color1 = new THREE.Color("#5ee1ff");
    const color2 = new THREE.Color("#5ee1ff");
  
    const colors = [];
    const positions = geometry.attributes.position.array; // Access vertex positions
    const vertexCount = geometry.attributes.position.count;
  
    for (let i = 0; i < vertexCount; i++) {
      const x = positions[i * 3]; // X-coordinate of the vertex
      const normalizedX = (x + 5) / 10; // Normalize X to range [0, 1]
      const lerpedColor = color1.clone().lerp(color2, normalizedX);
      colors.push(lerpedColor.r, lerpedColor.g, lerpedColor.b);
    }
  
    geometry.addAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(colors), 3)
    );
  
    const pointsMaterial = new THREE.PointsMaterial({
      size: 0.1,
      vertexColors: THREE.VertexColors, // Enable vertex colors directly
    });
  
    const points = new THREE.Points(geometry, pointsMaterial);
    scene.add(points);
  
    // Animation loop with slower rotation
    let rotationSpeed = 0.002; // Slower rotation speed
    function animate() {
      requestAnimationFrame(animate);
      points.rotation.y += rotationSpeed; // Slow rotation
      renderer.render(scene, camera);
    }
  
    animate();
  });
  
  