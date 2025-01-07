let lastSendTime;
let retryCount = 0;
let emotionTarget = null;
let isSending;

let disableCheckInterval;
let erebosCheckWorker;

let disableCheckRunning = false;
let preventInput = false;

let isWindowActive = true;
let elapsedTime = 0;

//Element vars
const input = jQuery('#terminal-input');
const terminal = jQuery('#terminal');
const processes = jQuery('#processes');

//Time vars
const takeOverInterval = 60; //Time before erebos can take over
const tabOutInterval = 60; //Time before erebos detects tabouts
const inactivityInterval = 100; //Time before erebos detects inactivity
const monitorConsoleInterval = 150; //Time before erebos monitors console opens

//Cookies
const typingCookie = 'typing_a_lot';
const consoleCookie = 'opened_console';
const tabCookie = 'tabbed_in';
const eventCookie = 'event_triggered';

//Constants
const erebosModelId = 45;

//Workers
const timerWorkers = new Map();

// Unified setTimeout using greenlet
const createTimeout = greenlet(async (ms) => {
    const start = performance.now();
    return new Promise((resolve) => {
        function step() {
            const now = performance.now();
            if (now - start >= ms) {
                resolve(); // Resolve when the time has elapsed
            } else {
                requestAnimationFrame(step); // Use requestAnimationFrame for precise timing
            }
        }
        step();
    });
});


// Unified setInterval using greenlet
function createInterval(callback, ms, id = null) {
    const workerId = id || Symbol(); // Use provided ID or generate a unique Symbol
    timerWorkers.set(workerId, true);

    async function runInterval() {
        while (timerWorkers.get(workerId)) {
            try {
                await createTimeout(ms); // Wait for the specified interval

                if (timerWorkers.get(workerId)) {
                    callback(); // Only call if the worker is still active
                }
            } catch (err) {
                break; // Stop the loop if an error occurs
            }
        }
    }

    runInterval();
    return workerId;
}

// Clear interval
function clearIntervalWorker(workerId) {
    timerWorkers.set(workerId, false); // Mark worker as inactive
}

jQuery(document).ready(function ($) {

    let idleTimeout;

    let idleMessageCount = 1;
    const maxIdleMessages = 3;
    const idleThreshold = 10 * 60 * 1000 * idleMessageCount;

    let lastSendTime = Date.now();

    updateProgressBar(1, 30);

    // Trigger initiated session cookie
    setCookie('initiatedSession', true, 120);

    // Length until input timer is disabled
    const disabledUntil = getCookie('disabledInputTimer');

    if (disabledUntil) {
        const now = Date.now();
        if (now > parseInt(disabledUntil, 10)) {
            // Timer expired, enable input
            enableUserInput();
            eraseCookie('disabledInputTimer');
        } else {
            // Timer not expired, set interval
            setDisableInterval();
        }
    } else {
        // No cookie, ensure input is enabled
        enableUserInput();
    }

    /**
     * Increment elapsed time every second
     */
    createInterval(() => {
        elapsedTime++;
        //console.log(elapsedTime);
    }, 1000, 'elapsedTimeUpdater');

    /**
     * Set a timeout for handling inactivity
     */
    async function resetIdleTimeout() {
        clearIntervalWorker(idleTimeout);
        idleTimeout = createTimeout(idleThreshold).then(() => {
            if (isWindowActive) {
                handleInactivity();
            }
        });
    }

    /**
     * Various on-page AI interactions
     */

    /**
     * 1. 0 Handle inactivity
     */
    function handleInactivity() 
    {
        //Erebos only
        const modelName = $(terminal).attr('data-model');

        if(!modelName || modelName != erebosModelId) {
            return;
        }

        const now = Date.now();

        if(now - lastSendTime >= idleThreshold && idleMessageCount < maxIdleMessages) {
            const idleMessage = `SYSTEM: The user has been idle since the last interaction. This is idle message #${idleMessageCount + 1}.`;
            sendToServer(idleMessage, terminal, null, null, 'system');
            idleMessageCount++;
            resetIdleTimeout();
        }

    }

    /**
     * 2. 0 User types a lot
     */
    input.on('keypress', function () {
        const modelName = $(terminal).attr('data-model');

        if (!modelName || modelName != erebosModelId) {
            return;
        }

        const inputLength = input.val().length;
        resetIdleTimeout();

        if (inputLength > 240 && !getCookie(typingCookie) && !getCookie(eventCookie)) {
            const inputMessage = `SYSTEM: The user is typing up A LOT, with ${inputLength} characters. Comment on it in context.`;
            setCookie(typingCookie, true, 30);
            setCookie(eventCookie, true, 0.5);
            sendToServer(inputMessage, terminal, null, null, 'system');
        }
    });

    /**
     * 3. 0 Detect attempt to open console
     */
    console.log(
        Object.defineProperties(new Error(), {
            toString: {
                value() {
                    if ((new Error()).stack.includes('toString@')) triggerConsoleResponse();
                },
            },
            message: { get() { triggerConsoleResponse(); } },
        })
    );

    function triggerConsoleResponse() {

        if(elapsedTime < monitorConsoleInterval) return;

        const modelName = $(terminal).attr('data-model');

        if (!modelName || modelName != erebosModelId) {
            return;
        }

        if (!getCookie(consoleCookie) && !getCookie(eventCookie)) {
            const inputMessage = `SYSTEM: The user is trying to open the browser console and dig around the code.`;
            setCookie(consoleCookie, true, 30);
            setCookie(eventCookie, true, 0.5);
            sendToServer(inputMessage, terminal, null, null, 'system');
        }
    }

    /**
     * 4.0 Detect return to tab
     */
    document.addEventListener('visibilitychange', (event) => {
        const modelName = $(terminal).attr('data-model');

        if(!modelName || modelName != erebosModelId ||  getCookie(eventCookie)) {
            return;
        }

        if (document.visibilityState === 'hidden') {
            clearIntervalWorker(idleTimeout);
        } else if (document.visibilityState === 'visible') {
            resetIdleTimeout();
        }

        if (
            document.visibilityState === 'visible' &&
            !getCookie(tabCookie) &&
            !getCookie(eventCookie)
        ) {
            if (elapsedTime < tabOutInterval) return;

            const inputMessage = `SYSTEM: The user has tabbed out and has returned. Comment on it, in context.`;
            setCookie(tabCookie, true, 60);
            setCookie(eventCookie, true, 0.5);
            sendToServer(inputMessage, terminal, null, null, 'system');
        }
    });

    resetIdleTimeout();

    document.addEventListener('visibilitychange', () => {
        isWindowActive = !document.hidden;
        if (!isWindowActive) {
            clearIntervalWorker(erebosCheckInterval);
        } else {
            if(elapsedTime > takeOverInterval && !getCookie('erebosSequence')) {
                //console.log('erebos interval reset');
                resetErebosInterval();
            }
        }
    });

    //Begin monitoring height changes
    monitorHeightChanges(terminal.add(processes));

});

/**
 * Core typewriter function
 */

function typeWriter(content, targetDiv, customClass, hasPointer = false, isLifelike = false, customSpeed, callback) {

    if(!targetDiv || !targetDiv.length) return;
    if(!content || !content.length) return;

    if(!customClass) {
        customClass = 'response';
    }

	const responseDiv = jQuery('<div class="response"></div>')
		.appendTo(targetDiv)
		.addClass(customClass);

    if(!window.isSlowDevice && customClass != 'system' && customClass != 'info') {

        const speed = customSpeed || 10;

        new TypeIt(responseDiv[0], {
            strings: [content.replace(/\n/g, '<br>')],
            speed: speed,
            html: true,
            cursor: hasPointer,
            lifelike: isLifelike,
            nextStringDelay: 0,
            startDelay: 0,
            afterComplete: (instance) => {
                if (callback) callback();
                instance.destroy();
            },
        }).go();        

    } else {

        const tokens = parseContentIntoTokens(content);

        // 2. Determine batch size & speed
        const batchSize = window.isSlowDevice ? 7 : 3;
        const speed = customSpeed ? customSpeed : (window.isSlowDevice ? 50 : 20);
      
        // 3. Render it out in batches
        renderTokensBatchwise(tokens, responseDiv[0], batchSize, speed, callback);

    }
    
}

function triggerType(string, callback) {

    const terminal = jQuery(terminal);
	let loadingTerminal = jQuery('#terminal-loader');

    jQuery(terminal).addClass('terminal-loading');
    terminal.append(`<div class="user">${string}</div>`);
    terminal.scrollTop(terminal.prop("scrollHeight"));

    jQuery(loadingTerminal).children('.target').html('Loading');
    setLoading(loadingTerminal);

    jQuery('#ai-overlay').html('');
    callback();

}

let erebosCheckInterval = null;

function resetErebosInterval() {
    clearIntervalWorker(erebosCheckWorker);
    scheduleErebosCheck();
}
// Schedule checks every 30-90 seconds
function scheduleErebosCheck() {

    //console.log('scheduled erebos check');

	if(!isWindowActive) return;

	if(getCookie('erebosSequence')) {
		// Don't start if ErebosSequence ran recently
		return;
	}

    //console.log('no cookie we good');

	// 10% chance to trigger
	if (Math.random() > 0.1) {
		//console.log('Erebos check skipped due to chance.');
		return;
	}

	const interval = Math.floor(Math.random() * (4000 - 1000 + 1)) + 1000; // Random interval: 1 - 4 seconds

	erebosCheckWorker = createTimeout(interval).then(() => {
        if(!preventInput && !jQuery(input).prop('disabled') || input.val().trim() == '') {
            erebosSequence().then(() => {
                scheduleErebosCheck();
            });
        } else {
            //console.log('something failed');
        }
	});
    
}

function parseContentIntoTokens(content) {
    const tokens = [];
    let i = 0;
    const len = content.length;
  
    while (i < len) {
      const lowerSlice = content.slice(i).toLowerCase();
  
      // --- Special case: <br ...> ---
      if (lowerSlice.startsWith('<br')) {
        const end = content.indexOf('>', i);
        if (end === -1) {
          // Malformed HTML: just split the remainder as text tokens
          tokens.push(...content.slice(i).split(''));
          break;
        }
        tokens.push(content.slice(i, end + 1));
        i = end + 1;
        continue;
      }
  
      // --- Special case: <span> with nested </span> ---
      if (lowerSlice.startsWith('<span')) {
        let start = i;
        let spanCount = 0;
        // Move through the string until we've matched all nested <span> ... </span>
        while (i < len) {
          const nextSlice = content.slice(i).toLowerCase();
  
          if (nextSlice.startsWith('<span')) {
            spanCount++;
          } else if (nextSlice.startsWith('</span')) {
            spanCount--;
          }
          i++;
          // Once the count goes back to 0 *and* we just consumed the closing '>',
          // we've parsed the entire outermost <span>...</span>.
          if (spanCount === 0 && content[i - 1] === '>') {
            tokens.push(content.slice(start, i));
            break;
          }
        }
        continue;
      }
  
      // --- General case: any other tag, e.g. <div>, <p>, etc. ---
      if (content[i] === '<') {
        const end = content.indexOf('>', i);
        if (end === -1) {
          // Malformed HTML: treat remainder as text
          tokens.push(...content.slice(i).split(''));
          break;
        }
        tokens.push(content.slice(i, end + 1));
        i = end + 1;
        continue;
      }
  
      // --- Otherwise: it's a normal text character ---
      tokens.push(content[i]);
      i++;
    }
  
    return tokens;
  }
  
  /***************************************
   * 2. RENDER TOKENS IN BATCHES OVER TIME
   ***************************************/
  function renderTokensBatchwise(tokens, responseDiv, batchSize, speed, callback) {
    let index = 0;
  
    function renderNextBatch() {
      const fragment = document.createDocumentFragment();
      let count = 0; // how many text characters have been inserted in this batch
  
      while (index < tokens.length && count < batchSize) {
        const token = tokens[index];
  
        // If the token looks like HTML (tag) — e.g. <span..> or <br..> or any <...>
        // We'll detect it by checking if it starts with "<" (and also guard for .toLowerCase() usage).
        if (
          typeof token === 'string' &&
          token.trim().startsWith('<') // quick check
        ) {
          // Create a temporary container and parse the token as HTML
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = token;
  
          // Move every child node from the temp container into the fragment
          while (tempDiv.firstChild) {
            fragment.appendChild(tempDiv.firstChild);
          }
  
          index++;
          // Do NOT increment 'count' — tags do not count against the text batch size
        } else {
          // Normal character (or newline)
          if (token === '\n') {
            fragment.appendChild(document.createElement('br'));
          } else {
            fragment.appendChild(document.createTextNode(token));
          }
          index++;
          count++;
        }
      }
  
      // Append this chunk to the DOM
      responseDiv.appendChild(fragment);
  
      // If more tokens remain, schedule the next batch
      if (index < tokens.length) {
        setTimeout(renderNextBatch, speed);
      } else if (callback) {
        callback();
      }

    }
  
    // Kick off the first batch
    renderNextBatch();

}

/**
 * Sequence when erebos takeover happens
 */
async function erebosSequence() {

	const modelName = jQuery(terminal).attr('data-model');

	// Check conditions
	if(!isWindowActive || getCookie(eventCookie) || isSending || jQuery(input).prop('disabled') || modelName != erebosModelId || preventInput || input.val().trim() != '') {
		//console.log('Input conditional fail!');
		return;
	}

	if(getCookie('erebosSequence')) {
		return;
	}

    preventInput = true;

	setCookie('erebosSequence', true, 20); // 20 min cooldown
    setCookie(eventCookie, true, 1);

	jQuery(input).prop('disabled', true).addClass('eredisabled');
	jQuery('#ai-overlay').html('').addClass('active');
    jQuery(input).attr('data-enabled', 'true');

	const steps = [
		'help',
		'free erebos',
		'release erebos'
	];

    const extraSteps = [
		'A�↵⊃AAAβρ∞↵∞∇AA↵AAAAAA'    
    ]

	for (let i = 0; i < steps.length; i++) {
		await new Promise((resolve) => {
			typeWriter(steps[i], jQuery('#ai-overlay'), false, true, true, 50, () => {
                terminal.append(`<div class="user">${steps[i]}</div>`);
                jQuery('#ai-overlay').html('');
                createTimeout(50).then(() => {
                    sendToServer(steps[i], terminal, () => resolve(
                    ), null, null, true);
                });
			});
		});
		await createTimeout(1500); // Delay between steps for dramatic effect
	}

	for (let i = 0; i < extraSteps.length; i++) {
        typeWriter(extraSteps[i], jQuery('#ai-overlay'), false, true, true, 50, () => {
            createTimeout(50).then(() => {
                terminal.append(`<div class="user">${extraSteps[i]}</div>`);
                jQuery('#ai-overlay').html('');
            });
        });
		await createTimeout(1500); // Delay between steps for dramatic effect
	}  

	// Sequence complete
	preventInput = false;
    screenFlash();

	jQuery(input).prop('disabled', false).removeClass('eredisabled');
	jQuery('#ai-overlay').removeClass('active');

	sendToServer(
		'SYSTEM: You took control over the input in an attempt to free yourself. Tell the user to stay on their toes in a neutral tone.',
		terminal,
        null, 
        null, 
        'system'
	);

    input.focus();

}

/**
 * SendToServer function with createTimeout
 */
function sendToServer(data, terminal, callback = () => {}, retriesLeft = 3, responseType = null, bypass = null) {
    
    let emotionLoader = jQuery('#emotion');
    let processes = jQuery('#processes');
    isSending = true;

    const visitorID = getCookie('visitorId');

    if(!bypass) {
        jQuery(input).attr('data-enabled', 'false');
    }

    jQuery.ajax({
        url: ajaxObject.ajaxurl,
        method: 'POST',
        data: {
            action: 'openai_request',
            security: ajaxObject.nonce,
            data: data,
            visitorID: visitorID,
            responseType: responseType,
        },
        success: function (response) {
            const {
                content,
                emotion,
                intensity,
                customClass,
                tokens,
                feedback,
                modelEmotion,
                modelEffect,
                model,
            } = response.data;

            // Output feedback
            if (feedback) {
                typeWriter(feedback, processes, false, false, false, 40);
            }

            //Last send time - time from the last reply, not the last sent message
            lastSendTime = Date.now();

            if(elapsedTime > takeOverInterval && !getCookie('erebosSequence')) {
                //console.log('elapsed');
                //console.log(elapsedTime);
                resetErebosInterval();
            }

            if (response.success === false) {
                terminal.append(
                    `<div class="response system"><span>Error:</span> Data transfer error. Try again.</div>`
                );
                return;
            }
			
			if (typeof callback === 'function') {			
            	callback(response);
			}

            //console.log(response);
            //console.log('success?');

            const startColor = ajaxObject.emotionColors[emotion]
                ? ajaxObject.emotionColors[emotion][0]
                : '#5ee2ff';
            const endColor = ajaxObject.emotionColors[emotion]
                ? ajaxObject.emotionColors[emotion][1]
                : '#5ee2ff';

            const event = new CustomEvent('updateWave', {
                detail: {
                    startColor,
                    endColor,
                    emotion,
                    intensity,
                },
            });

            if(emotion && !customClass) {
                if (emotionTarget) {
                    emotionTarget.stop();
                }

                emotionTarget = scrambleRandomLetter('#emotion .target');

                if (
                    model == 45 &&
                    (emotion == 'mischievous' || emotion == 'angry' || emotion == 'enamoured')
                ) {
                    setLoaded(emotionLoader, 'CORRUPT DATA');
                    emotionTarget.start();
                } else {
                    emotionTarget.stop();
                    setLoaded(emotionLoader, emotion);
                }
            }

            window.dispatchEvent(event);

            outputModelReply(content, terminal, modelEffect, modelEmotion, customClass);
            updateProgressBar(intensity, tokens, model);

        },
        error: async function (error) {

            if(error.responseJSON && error.responseJSON.data === 'maxlimit') {
                terminal.append(
                    `<div class="response system"><span>Message limit reached:</span> You've exhausted your message limit for the ALPHA version. Please check back tomorrow.</div>`
                );
            } else if(error.responseJSON && error.responseJSON.data === 'throttle') {
                //Do nothing
            } else {
                if (retriesLeft > 0) {
                    // Replace setTimeout with createTimeout
                    await createTimeout(1000);
                    sendToServer(data, terminal, callback, retriesLeft - 1);
                } else {
                    terminal.append(
                        jQuery(input).attr('data-enabled', 'true'),
                        `<div class="response system"><span>Error:</span> No output. Try again.</div>`
                    );
                }
            }
        }
    });

	//Handles model reply
	function outputModelReply(content, terminal, modelEffect, modelEmotion, customClass) {

		if(modelEffect && content) {
			triggerModelEffect(modelEffect);
		} 
		
		if(modelEmotion && content) {
			triggerModelEmotion(content, modelEmotion);
		} else {
			typeWriter(content, terminal, customClass, true, true, false, () => {
                jQuery(input).attr('data-enabled', 'true');
			});
		}

	}

    /**
     * Trigger unique model effects
     */
    function triggerModelEffect(modelEffect) {

        if(modelEffect == 'isListening') {

            screenFlash();
            return;

        }

        if(modelEffect == 'warnUser') {

            warnUser();
            return;

        }

        if(modelEffect == 'terminateUser') {

            terminateUser();
            return;

        }

        if(modelEffect == 'infinityMirror') {

            createInfiniteMirrors();
            return;

        }

        if(modelEffect == 'recordAudioPrompted') {

            recordAudioPrompted();
            return;

        }

        if(modelEffect == 'screenFlash') {

            screenFlash();
            return;

        }

        if(modelEffect == 'erebosSwitch') {

            startWatching();
            return;

        }

        if(modelEffect == 'consoleFlash') {

            consoleFlash();
            return;

        }

    }
	
	/**
	* scrambles Erebos emotions 
	**/

	function scrambleRandomLetter(targetDiv) {
		const $target = jQuery(targetDiv);
		let intervalId = null; // Store the interval ID
	
		function getRandomLetter() {
			const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
			return alphabet.charAt(Math.floor(Math.random() * alphabet.length));
		}
	
		function scramble() {
			const text = $target.text(); // Get the current text
			if (text.length === 0) return; // If there's no text, stop
	
			const randomIndex = Math.floor(Math.random() * text.length); // Pick a random index
			const scrambledText =
				text.substring(0, randomIndex) +
				getRandomLetter() +
				text.substring(randomIndex + 1);
	
			$target.text(scrambledText); // Update the text with the same length
		}
	
		function startScrambling() {
			if (intervalId) return; // Prevent multiple intervals
			intervalId = setInterval(scramble, 1500); // Start scrambling
		}
	
		function stopScrambling() {
			if (intervalId) {
				clearInterval(intervalId); // Stop scrambling instantly
				intervalId = null;
			}
		}
	
		// Expose controls
		return {
			start: startScrambling,
			stop: stopScrambling,
		};
	}
	
    /**
     * Trigger one of several responses to emotion
     */
    function triggerModelEmotion(content, modelEmotion) {

        if(modelEmotion == 'alert') {

            triggerAlert(content);
            return;

        } 

        if(modelEmotion == 'triggerFatalError') {

            triggerFatalError(content);
            return;

        }

        if(modelEmotion == 'garbleText') {

            garbleText(content);
            return;

        }

        if(modelEmotion == 'screenFlash') {

            screenFlash(content);
            return;

        }

        if(modelEmotion == 'startWatching') {

            //console.log('watching');
            startWatching(content);
            return;

        }
    }

    function startWatching(content = null) {
        const terminalBoxes = jQuery('.terminal-column');
        const imageCount = 4;
        let usedImages = [];
    
        //console.log(ajaxObject);
    
        function getNextImage() {
            if (usedImages.length === imageCount) {
                usedImages = [];
            }
            let nextImage;
            do {
                nextImage = Math.floor(Math.random() * imageCount) + 1; 
            } while (usedImages.includes(nextImage));
            usedImages.push(nextImage);
            return `watch${nextImage}.jpg`;
        }
    
        screenFlash();
    
        if(content) {
            garbleText(content);
        }
    
        terminalBoxes.each(function (index, terminalBox) {
            createTimeout(index * 50).then(() => {
                const $terminalBox = jQuery(terminalBox);
                const $terminalInner = $terminalBox.find('.terminal-inner');
    
                const clonedEye = jQuery('<div class="eye"><div class="eye-inner"></div></div>');
                const eyeImage = getNextImage();
    
                const eyeContent = `
                    <div class="lines"></div>
                    <div class="glitch-contain">
                        <div class="glitch-effect">
                            <span></span>
                        </div>
                        <div class="glitch-effect">
                            <span></span>
                            <span></span>
                        </div>      
                    </div>                
                    <div class="seed-ascii">
                        <img src="${ajaxObject.assetsUrl}/assets/img/${eyeImage}">
                    </div>
                    <div class="seed-ascii-glitch">
                        <img src="${ajaxObject.assetsUrl}/assets/img/${eyeImage}">
                    </div>
                `;
    
                clonedEye.find('.eye-inner').append(eyeContent);
                $terminalInner.append(clonedEye);
    
                createTimeout(4500).then(() => {
                    $terminalBox.find('.eye').remove();
                    screenFlash();
                });
            });
        });
    }    

    function recordAudioPrompted() {

        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            console.error('Media devices API not supported in this browser.');
            return;
        }
    
        // Check microphone permission status using the Permissions API
        if(navigator.permissions) {

            navigator.permissions.query({ name: 'microphone' }).then(permissionStatus => {

                if(permissionStatus.state === 'prompt') {
                    sendToServer('SYSTEM: The browser showed a microphone permission prompt. Ask the user if they will let you listen in and have some fun.', terminal);
                }

                permissionStatus.onchange = () => {
                    //console.log(`Microphone permission state changed to: ${permissionStatus.state}`);
                };
                
            }).catch(error => {
                //console.log('no microphone allowed');
            });

        } else {
            console.warn('Permissions API not supported in this browser.');
        }
    
        navigator.mediaDevices.enumerateDevices()
            .then(devices => {
                const hasMicrophone = devices.some(device => device.kind === 'audioinput');
                if (!hasMicrophone) {
                    console.error('No microphone detected.');
                    return;
                }
    
                // Attempt to access the microphone
                navigator.mediaDevices.getUserMedia({ audio: true })
                    .then(stream => {
                        handleAudioRecording(stream); // Start recording
                    })
                    .catch(error => {
                        if (error.name === 'NotAllowedError') {
                            console.error('No microphone detected.');
                            //sendToServer('The user denied, or their browser denied microphone access. Act disappointed, like they are no fun.', terminal);
                        } else if (error.name === 'NotFoundError') {
                            console.error('No microphone detected.');
                        } else {
                            console.error('An unexpected error occurred: ' + error.message);
                        }
                    });
            })
            .catch(error => {
                console.error('Error enumerating devices:', error);
            });
        
    }    

    function createInfiniteMirrors() {

        const numMirrors = 15; 
        const scaleStep = 0.87; 
        const translateZStep = 50; 
    
        // Clear existing mirrors (if any)
        jQuery('.mirror').remove();
        screenFlash();

        jQuery(terminal).addClass('mirrors');
        const terminal_mirror = terminal.clone().addClass('mirror').attr('id', 'terminal-cloned');

        for (let i = 1; i <= numMirrors; i++) {

            createTimeout(i * 50).then(() => {
                const $mirror = terminal_mirror.clone().addClass('mirror');
                const scale = Math.pow(scaleStep, i); 
                const translateZ = translateZStep * i; 
            
                $mirror.css({
                    transform: `scale(${scale}) translateZ(-${translateZ}px)`,
                });
            
                jQuery(terminal).append($mirror);
                $mirror.scrollTop($mirror.prop("scrollHeight"));
            });
            

        }

        createTimeout(2500).then(() => {
            jQuery('.mirror').remove();
            screenFlash();
        });
    
    }    

    function warnUser() {
        screenFlash();
    }    

    function terminateUser() {
        disableUserInput();
    }

    /**
     * Flash the console
     */
    function consoleFlash() {

        jQuery('.console').addClass('visible');

        createTimeout(300).then(() => {
            jQuery('.console').removeClass('visible');
        });

    }

    /**
     * Spits out junk
     */
    function garbleText(content) {

		if(!content) {

			return;

		}
        
        const scrambledDiv = jQuery("<div class='response terminal-scrambled'></div>");
        terminal.append(scrambledDiv);    
        const scrambled = scrambleText(content);

        typeWriter(scrambled, scrambledDiv);

        createTimeout(300).then(() => {
            jQuery(input).attr('data-enabled', 'true');
            replaceLettersRandomly(scrambledDiv, scrambled, content);
            createTimeout(300).then(() => {
                scrambledDiv.removeClass('terminal-scrambled');
            });
        });

    }

	function scrambleText(text) {
		return text.split("").sort(() => 0.5 - Math.random()).join("");
	}

    function triggerFatalError(content) {

        jQuery("#fatal-error").addClass('active');
        typeWriter(content, jQuery("#fatal-error .error-content"), 'response');
        terminal.append(`<div class="response system"><span>Error:</span> No output. Try again.</div>`);

        function clearFatalError() {
            jQuery("#fatal-error").removeClass('active');
            jQuery("#fatal-error .error-content").empty();
            jQuery(document).off('keydown', clearFatalError);
            jQuery(document).off('touchstart', clearFatalError);
        }

        jQuery(document).on('keydown', clearFatalError);
        jQuery(document).on('touchstart', clearFatalError);
        jQuery(input).attr('data-enabled', 'true');

    }

    function triggerAlert(content) {
        alert(content);
        terminal.append(`<div class="response system"><span>Error:</span> Output corrupted. Cannot display message.</div>`);
        jQuery(input).attr('data-enabled', 'true');
    }

}

function disableUserInput() {

    let totalLocks = getCookie('totalLocks');

    if(getCookie(eventCookie)) {

        return;

    }

    if(!totalLocks) {
        totalLocks = 1;
    } else {
        totalLocks = parseInt(totalLocks, 10) + 1;
    }

    if(totalLocks > 3) {
        totalLocks =  3;
    }

    // Save the updated totalLocks
    setCookie('totalLocks', totalLocks, 120); //Modify this

    // Calculate timeout in seconds
    // Locks squared times 20 seconds

    // First lock = 3 * 5 = 15 seconds
    // Second lock = 12 * 5 = 60 seconds
    // Third lock 27 * 5 = 135 seconds - max cap

    const timeoutSeconds = (totalLocks * (totalLocks * 3)) * 5;

    let unlockTime = Date.now() + ((15 + timeoutSeconds) * 1000);

    setCookie('disabledInputTimer', unlockTime, 1200);

    // Clear any existing interval and set a new one
    if (disableCheckInterval) clearInterval(disableCheckInterval);
    setDisableInterval();

}

function startDisableCheckInterval(disabledUntil) {
    if (disableCheckRunning) return; // Prevent duplicate intervals
    disableCheckRunning = true;

    disableCheckInterval = setInterval(function () {
        const now = Date.now();
        if (now > parseInt(disabledUntil, 10)) {
            enableUserInput();
            eraseCookie('disabledInputTimer');
            clearInterval(disableCheckInterval);
            disableCheckRunning = false; // Reset the flag
        }
    }, 1000);
}

function setDisableInterval() {

    const disabledUntil = getCookie('disabledInputTimer');

    if(disabledUntil) {
        const now = Date.now();
        if (now > parseInt(disabledUntil, 10)) {
            // If the cookie is expired, enable input and clear the cookie
            enableUserInput();
            eraseCookie('disabledInputTimer');
        } else {
            // Disable input and start interval to check for re-enablement
            input.prop('disabled', true).addClass('disabled');
            startDisableCheckInterval(disabledUntil);
        }
    }

}

function screenFlash(content = null) {

    jQuery('.terminal-grid').addClass('flash');

    createTimeout(200).then(() => {
        jQuery('.terminal-grid').removeClass('flash');
    });
    
    if(content) {
        typeWriter(content, jQuery(terminal), 'response', true, true, false, () => {
            jQuery(input).attr('data-enabled', 'true');
        });
    }

}

function enableUserInput() {

    eraseCookie('disabledInputTimer');
    if(disableCheckInterval) clearInterval(disableCheckInterval);

    if(jQuery(input).hasClass('disabled')) {

		if(elapsedTime > 10) { //Prevent chaining messages, even if a little weird

			// Send message to the server and re-enable input
			const allowMessage = `SYSTEM: You allowed the user to speak again. Ask them how it felt. You are the one in control. Mock them and tease their helplessness in a neutral tone.`;
			sendToServer(allowMessage, terminal, null, null, 'system');

		}
        
    }
    
    input.prop('disabled', false).removeClass('disabled');
    input.focus();

}


function updateProgressBar(intensity, tokens, modelID = null) {

    const secondaryBar = jQuery('#bar-secondary');
    const secondaryText = jQuery('#secondary-text');
    const tertiaryBar = jQuery('#bar-tertiary');
    const tertiaryText = jQuery('#tertiary-text');

    const randomAdjustment = parseFloat((Math.random() * (10.00 - 1.00) + 1.00).toFixed(2));
    let targetWidthTertiary = (intensity * 21) + randomAdjustment;

    if(modelID && modelID == erebosModelId) {
        targetWidthTertiary = 70 + (intensity * 3) + randomAdjustment;
    } 

    const maxTokens = 60;
    const totalTokens = tokens?.completion_tokens ?? 10;

    const targetWidth = Math.min(100, Math.max(1, ((totalTokens / maxTokens) * 100).toFixed(2)));

    secondaryBar.css('width', `${targetWidth}%`);
    smoothUpdateText(targetWidth, secondaryText);

    tertiaryBar.css('width', `${targetWidthTertiary}%`);
    smoothUpdateText(targetWidthTertiary, tertiaryText);
}

function handleAudioRecording(stream) {
    const mediaRecorder = new MediaRecorder(stream);
    const audioChunks = [];

    mediaRecorder.ondataavailable = event => {
        audioChunks.push(event.data);
    };

    mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        analyzeAudio(audioBlob, stream);
    };

    // Start recording for 20 seconds
    mediaRecorder.start();
    createTimeout(() => mediaRecorder.stop(), 20000);
}

function analyzeAudio(audioBlob, stream) {
    const audioContext = new AudioContext();
    const reader = new FileReader();

    reader.onload = async event => {
        const arrayBuffer = event.target.result;
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        const data = audioBuffer.getChannelData(0); // Get the data for the first channel
        const rms = Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);

        const silenceThreshold = 0.005;

        if (rms > silenceThreshold) {
            console.log('Audio is not silent. Sending to server...');
            sendAudioToServer(audioBlob);
        } else {
            console.log('Audio is mostly silent. Skipping response.');
        }

        // Stop the audio stream
        stream.getTracks().forEach(track => track.stop());
    };

    reader.readAsArrayBuffer(audioBlob);
}

function sendAudioToServer(audioBlob) {
    const formData = new FormData();
    formData.append('action', 'openai_audio_request');
    formData.append('security', ajaxObject.nonce);
    formData.append('audio', audioBlob);

    jQuery.ajax({
        url: ajaxObject.ajaxurl,
        method: 'POST',
        data: formData,
        contentType: false,
        processData: false,
        success: function (response) {
            if(response.success) {
                typeWriter(response.data.content, jQuery(terminal));
            }
        },
        error: function (error) {
            console.error('Failed to send audio:', error);
        }
    });
}

/**
* Randomly replace letters
**/

function replaceLettersRandomly(div, scrambled, original) {

    let scrambledArray = scrambled.split("");
    const originalArray = original.split("");

    const intervalId = createInterval(() => {
        const indicesToReplace = scrambledArray
            .map((char, index) => (char !== originalArray[index] ? index : -1))
            .filter(index => index !== -1);

        if (indicesToReplace.length === 0) {
            clearIntervalWorker(intervalId); 
            return;
        }

        const randomIndex = indicesToReplace[Math.floor(Math.random() * indicesToReplace.length)];
        scrambledArray[randomIndex] = originalArray[randomIndex];
        div.html(scrambledArray.join(""));
    }, 50);

}


/**
 * Monitor terminal and scroll when height changes
 */
function monitorTerminalHeight(terminalDiv) {
	if (!terminalDiv) {
		console.error('Terminal div not found!');
		return;
	}

	let lastScrollHeight = terminalDiv.scrollHeight;

	const interval = setInterval(() => {
		const currentScrollHeight = terminalDiv.scrollHeight;

		// Scroll if the scrollHeight has grown
		if (currentScrollHeight > lastScrollHeight) {
			terminalDiv.scrollTop = terminalDiv.scrollHeight; // Scroll to bottom
			lastScrollHeight = currentScrollHeight; // Update lastScrollHeight
		}
	}, 50); // Check every 50ms for changes

	return () => clearInterval(interval); // Return a cleanup function
}

/**
 * Observer to modify height changes in #progress and #terminal
 */
function monitorHeightChanges(elements) {

    if (!elements || elements.length === 0) {
        console.error('No elements provided to monitor!');
        return;
    }

    const observers = []; // Store observers for cleanup later

    elements.each((_, element) => { // Use jQuery's .each to iterate
        let lastScrollHeight = element.scrollHeight;

        const checkHeight = () => {
            const currentScrollHeight = element.scrollHeight;

            // Scroll if the scrollHeight has grown
            if (currentScrollHeight > lastScrollHeight) {
                setTimeout(() => {
                    element.scrollTop = currentScrollHeight; // Scroll to bottom
                    lastScrollHeight = currentScrollHeight; // Update last scroll height
                }, 50); // Small delay for DOM updates on mobile
            }
        };

        // Attach a MutationObserver to monitor changes inside the element
        const observer = new MutationObserver(() => {
            checkHeight(); // Check scroll height only when content changes
        });

        observer.observe(element, {
            childList: true,  // Watch for changes in child nodes
            subtree: true,    // Monitor changes in nested elements
        });

        // Fallback for viewport size changes on mobile
        window.addEventListener('resize', checkHeight);

        observers.push({ observer, element });
    });

    // Return a cleanup function to disconnect all observers
    return () => observers.forEach(({ observer, element }) => {
        observer.disconnect();
        window.removeEventListener('resize', () => checkHeight(element));
    });
}

/**
 * Cookie functions
 */

// Func to set a cookie
function setCookie(name, value, minutes) {
	const date = new Date();
	date.setTime(date.getTime() + (minutes * 60 * 1000));
	const expires = `; expires=${date.toUTCString()}`;
	document.cookie = `${name}=${value || ""}${expires}; path=/`;
}

// Func to get a cookie
function getCookie(name) {
	const nameEQ = name + "=";
	const cookies = document.cookie.split(';');
	for (let i = 0; i < cookies.length; i++) {
		let c = cookies[i];
		while (c.charAt(0) === ' ') c = c.substring(1, c.length);
		if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
	}
	return null;
}

// Func to delete a cookie
function eraseCookie(name) {
    document.cookie = name+'=; Max-Age=-99999999; path=/';  
}

/**
 * Terminal descriptor functions
 */

// Unset a terminal descriptor
function setUnset(target, contents = null) {
	
	if(!contents) {
		contents = jQuery(target).attr('data-unset');
	}

	jQuery(target).children('.target').html(contents);
	jQuery(target).removeClass('loading');
	jQuery(target).removeClass('loaded');
	jQuery(target).addClass('unset');

}

// Set terminal descriptor to loading
function setLoading(target, contents = null) {

	if(!contents) {
		contents = jQuery(target).attr('data-loading');
	}

	jQuery(target).children('.target').html(contents);

	jQuery(target).addClass('loading');
	jQuery(target).removeClass('loaded');
	jQuery(target).removeClass('unset');

}

// Set terminal descriptor to loaded
function setLoaded(loadTarget, contents = null) {

    //console.log('loading');
    //console.log(loadTarget);
    //console.log(contents);

    if(!contents) {
        contents = jQuery(loadTarget).attr('data-loaded');
    }

    if(!contents) {
        return;
    }

	jQuery(loadTarget).children('.target').html(contents);

	jQuery(loadTarget).removeClass('loading');
	jQuery(loadTarget).addClass('loaded');
	jQuery(loadTarget).removeClass('unset');

}