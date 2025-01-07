let animationFrameId = null;
let modelLoaded = false;
let lastKeyPressTime = 0;
let fallbackScheduled = false;

const loadingTerminal = jQuery('#terminal-loader');
const seedLoader = jQuery('#seed');

//Initial messages // To do: refine
//For stability this HAS to be 3 messages for now
const initialMessages = [
    "Initializing AI containment system...",
    "------------------------------------------",
    "INTERFACE READY"
];

//Matrix const - // To do: move to php
const firstArray = [
    "Initializing terminal",
    "Unpacking modules",
    "Accessing database"
];

let performanceCheckDoneResolve;

let performanceCheckDone = new Promise((resolve) => {
    performanceCheckDoneResolve = resolve;
});

/**
 * Output initial messages and measure speed
 */
jQuery(document).ready(function ($) {

    outputInitialMessages(initialMessages);

});

/**
 * Output initial messages into terminal and measure response speed
 */
function outputInitialMessages(initialMessages, index = 0) {

    if(index < initialMessages.length) {

        matrixTypeWriter(initialMessages[index], jQuery("#init-output"), () => {
            // If this is the third message, resolve the performance check promise
            if(index === 1) {
                performanceCheckDoneResolve();
            }
            outputInitialMessages(initialMessages, index + 1);
        });

    } else if(hasNotInteracted) {

        // The rest of your logic remains the same
        if(!getCookie('disabledInputTimer')) {
            const greetingMessage = "SYSTEM: The user has just entered the terminal or has refreshed the page. Greet them.";
            sendToServer(greetingMessage, jQuery("#terminal"), false, false, 'system');
        } else {
            const greetingMessage = "SYSTEM: The user has tried to get around you silencing their voice by refreshing the page. Mock their attempt in a neutral tone.";
            sendToServer(greetingMessage, jQuery("#terminal"), false, false, 'system');                
        }

    }

}

/**
 * Output init messages into processes
 */
function matrixFetchData(arrayIndex = 0) {
    const array = [
        "Initializing terminal",
        "Unpacking modules"
    ];

    // Stop if we've reached the end of the array
    if (arrayIndex >= array.length) {
        console.log("Finished cycling through the array.");
        return;
    }

    // Get the current text based on the index
    const text = array[arrayIndex] + '...';

    typeWriter(text, jQuery('#processes'), false, false, false, 40, async () => {

        // Use createTimeout before triggering the next iteration
        await createTimeout(500); // Delay for 600ms

        // Move to the next index
        matrixFetchData(arrayIndex + 1);

    });

}

/**
 * Set various loaders and triggers when check has completed
 */
(async function () {

    // Wait until we know if it's slow or not
    await performanceCheckDone;

    // Now we know window.isSlowDevice is set accordingly
    if (window.isSlowDevice) {
        // Maybe increase timeouts or skip heavy animations
        console.log("Detected slow device! We'll throttle animations.");
    }

    matrixFetchData();

    // Proceed with your logic now that we know performance capabilities
    await createTimeout(300); // Wait 0.3 seconds
    fetchModelSeed();
    
    await createTimeout(300); // Wait another 300ms (0.6s total)
    setLoaded(jQuery('#terminal-loader'));

    await createTimeout(200); // Wait another 200ms (0.8s total)
    setLoaded(jQuery('#seed'));
    
    enableInitialInput();
    triggerInitialMessage();

})();

function triggerInitialMessage() {

    if(!getCookie('disabledInputTimer')) {
        const greetingMessage = "SYSTEM: The user has just entered the terminal or has refreshed the page. Greet them.";
        sendToServer(greetingMessage, terminal, null, null, 'system');
    } else {
        const greetingMessage = "SYSTEM: The user has tried to get around you silencing their voice by refreshing the page. Mock their attempt in a neutral tone.";
        sendToServer(greetingMessage, terminal, null, null, 'system');                
    }

}

function enableInitialInput() {

    jQuery(input).attr('data-enabled', 'true'); //We leverage this in terminal.js

}

function matrixTypeWriter(content, targetDiv, callback) {

    if(!targetDiv || !targetDiv.length) {
        if (callback) callback();
        return;
    }

    const startTime = performance.now(); // Start timing
    const cpuCores = navigator.hardwareConcurrency || 1;

    const responseDiv = jQuery('<div class="response system"></div>')
        .appendTo(targetDiv);

    // Adjust typing speed for system messages
    const speed = 5;

    new TypeIt(responseDiv[0], {
        strings: [content.replace(/\n/g, '<br>')],
        speed: speed,
        html: true,
        cursor: false,
        lifelike: false,
        nextStringDelay: 0,
        startDelay: 0,

        afterComplete: (instance) => {
            const endTime = performance.now();
            const totalTime = endTime - startTime;
           //console.log('total time to write:');
            //console.log(totalTime);

            // Check if any of the responses took more than 4000ms
            if(totalTime > 4000 && !window.isSlowDevice && cpuCores < 4) {
                window.isSlowDevice = true;
            }

            if(callback) callback();
            instance.destroy(); // Free up memory
        },

    }).go();

}

/**
 * Keypress functions
 */

jQuery(document).ready(function ($) {

    const terminal = $('#terminal');
    const input = $('#terminal-input');

    input.on('keypress', function (event) {

        if(event.key === 'Enter') {

            event.preventDefault();

			//Return if we didn't load yet
			if($(input).attr('data-enabled') && ($(input).attr('data-enabled') == 'false')) {

				return;

			}

            jQuery(input).attr('data-enabled', 'false');
            enableInputOnce();

            const userInput = input.val().trim();
			const isLoading = (userInput.toLowerCase().startsWith('interface ') && userInput.length > 10);
			const commandClear = (userInput.toLowerCase() == 'clear');
			
			const commandWallet =(userInput.toLowerCase() == 'link');

			if(userInput) {

				//Purify
				const sanitizedInput = DOMPurify.sanitize(userInput, { ALLOWED_TAGS: [] });
				
				jQuery(terminal).addClass('terminal-loading'); //add class to terminal
				terminal.append(`<div class="user">${sanitizedInput}</div>`); //sanitize input

				$(loadingTerminal).children('.target').html('Loading');
				setLoading(loadingTerminal);

                //If user is attempting to load a model
				if(userInput && isLoading) {

					$(seedLoader).children('.target').html('Loading');
					setLoading(seedLoader);

				}

                //If command is wallet link, open the popup
				if(userInput && commandWallet) {

					$('#link-popup').addClass('visible');

				}

                //If command is clear, flush the screen
				if(commandClear) {

					setUnset(loadingTerminal);
					setUnset(jQuery('#seed'));
					$('#terminal').attr('data-model', '');
					$('.seed-art').removeClass('seedLoaded');

				}

				try {
					sendToServer(sanitizedInput, terminal, function (response) {

						modelLoaded = true;

						if(response) {

							terminal.removeClass('terminal-loading');
				
							if(response.success) {

								const {modelName, model, emotion} = response.data;
								lastKeyPressTime = 0;

								setLoaded(loadingTerminal);
                                
								if(model) {

									if(model != jQuery('#terminal').attr('data-model')) {

                                        setLoaded(jQuery('#seed'), modelName);
										fetchModelSeed();

									}									

                                    $('#terminal').attr('data-model', model);

								} else if(isLoading) {

									setUnset(loadingTerminal);
									setUnset(jQuery('#seed'));
									$('#terminal').attr('data-model', '');

								}

							} else {

								setUnset(loadingTerminal, 'Error');
								$(loadingTerminal).children('.target').html('Error');
								setUnset(loadingTerminal);

							}
						}
					});				
			
				} catch (error) {

					lastKeyPressTime = 0;

				} finally {

                    //Fallback - after call completes, enable input 5s later
                    isSending = false;
                    enableInputOnce();

                }

				input.val('');

			}			

        }

    });

});

function enableInputOnce() {
    // If there's already a scheduled timeout, do nothing.
    if (fallbackScheduled) return;
  
    fallbackScheduled = true;
  
    // Only schedule the timeout once.
    createTimeout(6000).then(() => {
      jQuery(input).attr('data-enabled', 'true');
      fallbackScheduled = false;
    });
}

