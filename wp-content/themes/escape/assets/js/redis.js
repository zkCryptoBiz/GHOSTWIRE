jQuery(document).ready(function($) {

    const existingVisitorId = getCookie('visitorId');
    console.log('visitorID from cookie');
    console.log(existingVisitorId);

    if(!existingVisitorId) {

        FingerprintJS.load().then(fp => {
            fp.get().then(result => {
                
                const visitorId = result.visitorId;
                setCookie('visitorId', visitorId, 720);

                const data = {
                    action: 'store_fingerprint_id',
                    fingerprint_id: visitorId
                };

                jQuery.post(ajaxObject.ajaxurl, data, function(response) {
                    console.log(response);
                }).fail(function(error) {
                    console.error(error.responseJSON.data);
                });

            });

        });
    }
});