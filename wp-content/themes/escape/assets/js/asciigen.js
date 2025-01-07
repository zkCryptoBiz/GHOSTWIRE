/**
 * Function to fetch model seed with AJAX
 */
function fetchModelSeed() {

    jQuery.ajax({
        url: ajaxObject.ajaxurl,
        type: "POST",
        data: {
            action: "fetch_model_seed"
        },
        success: function (response) {
            if(response.success) {
                const imageUrl = response.data;
                const canvas = document.getElementById("asciiCanvas");
                const ctx = canvas.getContext("2d");

                if(animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                    animationFrameId = null;
                }

                jQuery('.seed-art').addClass('seedLoaded');

                const bgImage = new Image();
                bgImage.onload = () => {
                    canvas.width = bgImage.width;
                    canvas.height = bgImage.height;
                    startAsciiAnimation(ctx, canvas.width, canvas.height, bgImage);
                };
                bgImage.onerror = () => { console.error("Error loading background image."); };
                bgImage.src = `${imageUrl}?t=${new Date().getTime()}`;
            } else {
                //console.error("Error fetching ASCII art:", response.data.message);
            }
        },
        error: function (xhr, status, error) {
            console.error("AJAX error:", error);
        }
    });
}

/**
 * ASCII canvas gen
 */
function startAsciiAnimation(ctx, canvasWidth, canvasHeight, bgImage) {

    const charWidth = window.isSlowDevice ? 19 : 16;
    const charHeight = window.isSlowDevice ? 26 : 22;
    const randInterval = window.isSlowDevice ? 0.005 : 0.01;
    const nFrames = window.isSlowDevice ? 10 : 3;
    const itemsToHighlight = window.isSlowDevice ? 400 : 100;

    const cols = Math.floor(canvasWidth / charWidth);
    const rows = Math.floor(canvasHeight / charHeight);

    let asciiGrid = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => (Math.random() < 0.15 ? '0' : '1'))
    );

    let revealGrid = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => false)
    );

    let unrevealedPositions = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            unrevealedPositions.push([r, c]);
        }
    }

    let allRevealed = false; 

    ctx.font = `${charHeight}px "Space Grotesk", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Preselect highlight positions
    const allPositions = [...unrevealedPositions];
    const highlightPositions = [];
    for (let i = 0; i < itemsToHighlight && allPositions.length > 0; i++) {
        const idx = Math.floor(Math.random() * allPositions.length);
        highlightPositions.push(allPositions[idx]);
        allPositions.splice(idx, 1);
    }

    const highlightSet = new Set(highlightPositions.map(pos => pos.join(',')));

    // Offscreen canvas for bg text
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = canvasWidth;
    offscreenCanvas.height = canvasHeight;
    const offCtx = offscreenCanvas.getContext('2d');
    offCtx.font = ctx.font;
    offCtx.textAlign = ctx.textAlign;
    offCtx.textBaseline = ctx.textBaseline;

    // Mask canvas
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = canvasWidth;
    maskCanvas.height = canvasHeight;
    const maskCtx = maskCanvas.getContext('2d');

    function rebuildMask() {
        maskCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        maskCtx.drawImage(bgImage, 0, 0, canvasWidth, canvasHeight);
    }
    rebuildMask();

    // Gradients
    const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
    gradient.addColorStop(0,   "rgba(59, 140, 63,0)");
    gradient.addColorStop(0.1, "rgba(59, 140, 63,0.08)");
    gradient.addColorStop(0.75,"rgba(38,255,244,0.125)");
    gradient.addColorStop(1,   "rgba(38,255,244,0.275)");

    const highlightGradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
    highlightGradient.addColorStop(0,   "rgba(59, 140, 63,0)");
    highlightGradient.addColorStop(0.1, "rgba(59, 140, 63,0.125)");
    highlightGradient.addColorStop(0.75,"rgba(38,255,244,0.2)");
    highlightGradient.addColorStop(1,   "rgba(38,255,244,0.4)");

    let frameCount = 0;
    const maskedCanvas = document.createElement('canvas');
    maskedCanvas.width = canvasWidth;
    maskedCanvas.height = canvasHeight;
    const maskedCtx = maskedCanvas.getContext('2d');

    let slowThrottlingActive = false;

    function drawAsciiGrid() {
        frameCount++;

        // Reveal logic for fade-in
        if (!allRevealed && unrevealedPositions.length > 0) {
            const toRevealCount = Math.ceil(unrevealedPositions.length * 0.05);
            for (let i = 0; i < toRevealCount && unrevealedPositions.length > 0; i++) {
                const idx = Math.floor(Math.random() * unrevealedPositions.length);
                const [rr, cc] = unrevealedPositions[idx];
                revealGrid[rr][cc] = true;
                unrevealedPositions.splice(idx, 1);
            }
            if (unrevealedPositions.length === 0) {
                allRevealed = true;
            }
        }

        // Clear main canvas
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        // Draw green ASCII
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (revealGrid[r][c]) {
                    const x = c * charWidth + charWidth / 2;
                    const y = r * charHeight + charHeight / 2;
                    ctx.fillStyle = highlightSet.has(`${r},${c}`) ? highlightGradient : gradient;
                    ctx.fillText(asciiGrid[r][c], x, y);

                    // Flip '0'/'1'
                    if (Math.random() < randInterval) {
                        asciiGrid[r][c] = (asciiGrid[r][c] === '0' ? '1' : '0');
                    }
                }
            }
        }

        // Redraw yellow masked text
        offCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        offCtx.fillStyle = "#fdab3d";
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (revealGrid[r][c]) {
                    const x = c * charWidth + charWidth / 2;
                    const y = r * charHeight + charHeight / 2;
                    offCtx.fillText(asciiGrid[r][c], x, y);
                }
            }
        }

        offCtx.globalCompositeOperation = "destination-in";
        offCtx.drawImage(maskCanvas, 0, 0, canvasWidth, canvasHeight);
        offCtx.globalCompositeOperation = "source-over";

        maskedCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        maskedCtx.drawImage(offscreenCanvas, 0, 0);

        ctx.drawImage(maskedCanvas, 0, 0);

        // If everything is revealed and we are on a slow device, switch to throttled updates
        if (allRevealed && window.isSlowDevice) {
            if (!slowThrottlingActive) {
                // Stop using requestAnimationFrame and switch to setTimeout
                slowThrottlingActive = true;
                setTimeout(drawAsciiGrid, 500); // update every 500ms
            } else {
                // Continue throttled updates
                setTimeout(drawAsciiGrid, 500);
            }
        } else if (!allRevealed) {
            // Before reveal completion, use requestAnimationFrame for smooth fade-in
            requestAnimationFrame(drawAsciiGrid);
        } else {
            // If not slow device or no throttling needed, continue normal RA
            requestAnimationFrame(drawAsciiGrid);
        }
    }

    // Start the fade-in immediately with requestAnimationFrame
    requestAnimationFrame(drawAsciiGrid);

    this.updateBgImage = function(newBgImage) {
        bgImage = newBgImage;
        rebuildMask();
    };
    
}
