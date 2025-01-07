jQuery(document).ready(function ($) {

	//Todo
	//Initate once model loads

    $('.bar-secondary').addClass('loaded');
    $('.bar-tertiary').addClass('loaded');

    $(".loading").each(function () {
        $(this).data("originalText", $(this).text());
    });

	jQuery('#link-button').on('click', function () {
		jQuery('#link-popup').addClass('visible');
	});

	jQuery('#link-popup').on('click', function () {
		jQuery('#link-popup').removeClass('visible');
	});	

});


jQuery(document).ready(function ($) {

    const barPrimary = document.getElementById('bar-primary');
    const primaryText = $('#primary-text');

    function updateBarBasedOnNetwork() {
        if (navigator.connection) {
            const connection = navigator.connection;
            const downlink = connection.downlink || 0; // Downlink speed in Mbps
            const minSpeed = 1; // Minimum speed
            const maxSpeed = 30; // Maximum speed

            const randomVariation = Math.floor(Math.random() * 10) + 1; 
            const targetWidth = Math.min(
                Math.max(((downlink - minSpeed) / (maxSpeed - minSpeed)) * 90 + 25, 10),
                100
            ) + randomVariation;

            barPrimary.style.width = `${targetWidth}%`;
            smoothUpdateText(targetWidth, primaryText);

        } else {
            console.log('Network Information API not supported in this browser.');
        }
    }

    // Initial update
    updateBarBasedOnNetwork();

    // Periodic recheck every 1.1 seconds
    setInterval(updateBarBasedOnNetwork, 2000);

    // Monitor changes in the network if the browser supports the 'change' event
    if (navigator.connection) {
        navigator.connection.addEventListener('change', updateBarBasedOnNetwork);
    }

});

function smoothUpdateText(targetWidth, primaryText, displayedWidth = 10) {
    
    function updateText() {
        if (Math.abs(targetWidth - displayedWidth) > 0.1) {
            displayedWidth += (targetWidth - displayedWidth) * 0.1; // Gradual adjustment
            primaryText.html(`${displayedWidth.toFixed(2)}%`);
            requestAnimationFrame(updateText); // Continue animation
        } else {
            // Finalize the value to match exactly
            displayedWidth = targetWidth;
            primaryText.html(`${displayedWidth.toFixed(2)}%`);
        }
    }

    requestAnimationFrame(updateText); // Start the animation
}

jQuery(document).ready(function($) {
    
    let hours = 0;
    let minutes = 0;
    let seconds = 0;
    let milliseconds = 0;
  
    function pad(value, digits) {
      return String(value).padStart(digits, "0");
    }
  
    function updateTimer() {
      milliseconds += 10;
  
      if (milliseconds === 1000) {
        milliseconds = 0;
        seconds += 1;
      }
      if (seconds === 60) {
        seconds = 0;
        minutes += 1;
      }
      if (minutes === 60) {
        minutes = 0;
        hours += 1;
      }
  
      const formattedTime = `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}:${pad(milliseconds / 10, 2)}`;
      $(".data-timer").text(formattedTime);

    }
  
    setInterval(updateTimer, 10); 

});