 /**
 * Pelagios common library
 * @license GPL v3(see LICENSE.txt)
 */
 define(['jquery', 
         'app/util', 
         'app/search_map', 
         'app/place_map', 
         'lib/text!template/widget_container.tmpl',
         'lib/text!template/place.tmpl',
         'lib/text!template/section.tmpl',
         'lib/text!template/flickr.tmpl',
         'lib/text!template/pleiades.tmpl',
         'lib/text!template/pelagios_partner.tmpl',
         'lib/text!template/error.tmpl',
         'lib/text!template/search.tmpl',
         'lib/text!template/annotations.tmpl',
         'lib/text!template/search_results.tmpl',
         'lib/text!template/new_tab.tmpl',
         'lib/text!template/about.tmpl',
         'lib/text!app/dataset.json',
         'jqueryui',
         'lib/jquery_pagination'
         ], 
        function ($, 
                  util, 
                  search_map, 
                  place_map, 
                  widget_container_tmpl, 
                  place_tmpl,
                  section_tmpl,
                  flickr_tmpl,
                  pleiades_tmpl,
                  pelagios_partner_tmpl,
                  error_tmpl,
                  search_tmpl,
                  annotations_tmpl,
                  search_results_tmpl,
                  new_tab_tmpl,
                  about_tmpl,
                  datasetJSON
                  ) {
                  
                
    var config = {
        URL_PELAGIOS_API_V2:         'http://pelagios.dme.ait.ac.at/api/',
        API_KEY_FLICKR:              'ddf82df2aba035bfcf14c12a4eff3335',
        TIMEOUT_PLEIADES:            6000,
        TIMEOUT_PELAGIOS:            60000,
        TIMEOUT_FLICKR:              6000,
        URL_PLEIADES:                'http://pleiades.stoa.org/places/',
        URL_FLICKR_SEARCH:           'http://api.flickr.com/services/rest/?format=json&method=flickr.photos.search',
        MAX_PHOTOS_FLICKR:           30,
        MSG_PLACE_NOT_FOUND:         'The place specified for this widget does not exist in the Pleiades gazetteer.',
        MSG_TITLE_PLACE_NOT_FOUND:   'Error: Unknown Place',
        MSG_PLEIADES_TIMEOUT:        'We cannot display the place name and map at the moment because the Pleiades website is not responding. Apologies for the inconvenience and please try again later.',
        MSG_TITLE_PLEIADES_TIMEOUT:  'Error: Pleiades not responding',
        NUM_ANNOTATIONS_TO_DISPLAY:  20
    }

    function Widget(widgetContext) {
          //var $ = window.jQuery.noConflict(true);
        var placeMap = {};
        var searchMap = {};
        var searchString = "";
        
        // Although not a good idea to use eval, however hard to get round
        // the security risks as the template files contain javascript 
        // and are on a different server from the html so nothing to stop some
        // sort of theoretical man in the middle attack
        eval(widget_container_tmpl);
        eval(place_tmpl);
        eval(section_tmpl);
        eval(flickr_tmpl);
        eval(pleiades_tmpl);
        eval(pelagios_partner_tmpl);
        eval(error_tmpl);
        eval(search_tmpl);
        eval(annotations_tmpl);
        eval(search_results_tmpl);
        eval(new_tab_tmpl);
        eval(about_tmpl);

        var dataset = $.parseJSON(datasetJSON);
        
        if (typeof($('#'+widgetContext.widgetID)) == undefined) {
            debug('ERROR: $(#'+widgetContext.widgetID+') is undefined');
        }

        // Load the style sheet 
        $('head').append('<link rel="stylesheet" type="text/css" href="'+
                         widgetContext.cssDir+
                         'pelagios.css" media="screen" />');
        // Add the basic widget structure to hang things off 
        var html = Handlebars.templates['widget_container']({widgetContext: widgetContext});
        $('#'+widgetContext.widgetID).append(html);
        $('.pelagios .container').width(widgetContext.containerWidth);
        // draggable() does not work in IE8 and it is possible that other
        // browsers also do not support it. It's not vital so just catch
        // any errors 
        try {
            $('#'+widgetContext.widgetID+'-container').draggable();
        } catch (err) {
            debug('ERROR: Could not make widget draggable');
        }        
              
        
        this.setTypePlace = function() { 
            var html = Handlebars.templates['place']({widgetContext: widgetContext});
            
            $('#'+widgetContext.widgetID+'-content').append(html);
                hidePlace();
            if (widgetContext.icon == true) {
                // Position the widget
                $('#'+widgetContext.widgetID+'-container').hide();
                $('#'+widgetContext.widgetID+'-icon').click(widgetPopUp);
                
                if (widgetContext.onMouseOver) {
                    $('#'+widgetContext.widgetID+'-icon').mouseover(widgetPopUp);
                    
                    // Clicking anywhere not on the widget closes the widget
                    $(document).click(function() {
                        $('#'+widgetContext.widgetID+'-container').hide();
                    });
                   $('#'+widgetContext.widgetID).click(function(e) {
                        e.stopPropagation();
                        return false;
                   });
                }
                
                $('#'+widgetContext.widgetID+'-close-widget').click(function() {
                    $('#'+widgetContext.widgetID+'-container').hide();
                });
            }
            displayPlace(widgetContext.pleiadesID);
        }
        
        function widgetPopUp() {
            // If the option has been set to open the widget in a new
            // tab then do this
            // NOTE - not working at the moment - see issue #55
            if (widgetContext.newTab) {
                // Open a new window/tab containing the widget with the 
                // option not set and inheriting all the widgetContext
                var w = window.open();
                var html = Handlebars.templates['new_tab']({widgetContext: widgetContext});
                $(w.document.body).html(html);  
                // Don't seem to be able to add the scripts via JQuery or 
                // Handlebars
                var script1   = document.createElement("script");
                script1.type  = "text/javascript";
                script1.src   = widgetContext.baseURL+'lib/require.js';
                w.document.head.appendChild(script1);   
                var script2   = document.createElement("script");
                script2.type  = "text/javascript";
                script2.src   = widgetContext.baseURL+'place.js';  
                w.document.head.appendChild(script2);              
            } else {
                // Hide any currently open Pelagios widgets so that we don't
                // have more than one widget open at once
                $('.pelagios .container').hide(); 
                
                // Position the widget
                $('#'+widgetContext.widgetID+'-container').show();
                var icon_offset = $('#'+widgetContext.widgetID+'-icon').offset();
                var container_offset = {top: $(window).scrollTop(), left: 200}
                $('#'+widgetContext.widgetID+'-container').offset(container_offset);
                
                // Refresh the map for it to display properly
                // Need to check that the refresh method exists as the 
                // widget might be opened before the google maps api has 
                // loaded and the map created
                if (widgetContext.displayMap && 
                    placeMap.hasOwnProperty('refresh')) {   
                    placeMap.refresh();
                }
            }
        }

        
        this.setTypeSearch = function() {
            // Add the template for the search form, search results, and template for displaying a place
            // then hide everything apart from the search form
            var html = Handlebars.templates['search']({widgetContext: widgetContext});
            $('#'+widgetContext.widgetID+'-content').append(html);
            var html = Handlebars.templates['place']({widgetContext: widgetContext});
            $('#'+widgetContext.widgetID+'-content').append(html);
            
            hidePlace();
            hideSearchResults();
            
            // Add a handler for the search form
            $('#'+widgetContext.widgetID+'-search-form').submit(function() {
                searchString = $('input:first').val();
                displaySearchResults();
                return false;
            });

        }
        
        function displayPlace(pleiadesID) {
            debug('DISPLAYING PLACE: pleiadesID: '+pleiadesID);
            placeMap = {};
            clearPlace();
            showPleiadesData(pleiadesID);
            if (widgetContext.type == 'place') {
                showAboutInformation();
            }
            showPelagiosData(pleiadesID);   
            showFlickrData(pleiadesID);
        }
        
        function showAboutInformation() {
            addSection('about', 'About Pelagios and this widget', widgetContext.imageDir+'partner_icons/pelagios.png', '');
            var html = Handlebars.templates['about']();
            
            $('#'+widgetContext.widgetID+'-content-about').append(html);
        }
        
       /**
        * Clear all the place information from the widget
        */     
        function clearPlace() {
            $('#'+widgetContext.widgetID+'-pleiades').empty();
            $('#'+widgetContext.widgetID+'-sections').empty();
        }

        function showFlickrData(pleiadesID) {
            var groupURIComponent = "";
            if (widgetContext.pleiadesFlickrGroupOnly) {
                groupURIComponent = "&group_id=1876758@N22";
            }
            var url = config.URL_FLICKR_SEARCH+
                            "&machine_tags=pleiades:depicts="+pleiadesID+
                            groupURIComponent+"&tag_mode=all&api_key="+
                            config.API_KEY_FLICKR+"&jsoncallback=?";  
            util.getAPIData(url, displayFlickrData, false, config.TIMEOUT_FLICKR, 
                       false);

            /**
            * Callback to display all the photos from flickr for the specified 
            * place
            */         
            function displayFlickrData(json) {        
                // If photos returned, add a flickr section
                if (json.hasOwnProperty('photos') && 
                    json.photos.hasOwnProperty('photo') && 
                    json.photos.photo.length > 0) { 
                    
                    addSection('flickr', 'flickr', 
                               widgetContext.imageDir+'icons/flickr-logo.png',
                               'Photo sharing website')
                    // Render the Handlebars template for the flickr data  
                    var data = {photo: json.photos.photo.slice(0, 
                                                     config.MAX_PHOTOS_FLICKR - 1), 
                                  //Flickr only lets us display 30 images at a time
                                pleiadesID: pleiadesID}

                    var html = Handlebars.templates['flickr'](data);
                    $('#'+widgetContext.widgetID+'-content-flickr').append(html);
                }
            }     
        }

        function showPleiadesData(pleiadesID) {
            var pleiadesURI    = config.URL_PLEIADES+pleiadesID;
            var pleiadesAPIURL = config.URL_PLEIADES+pleiadesID+'/json';
            util.getAPIData(pleiadesAPIURL, displayPleiadesData, displayPleiadesError, 
                       config.TIMEOUT_PLEIADES, true);
           /** 
            * Displays an error message if the call to the Pleiades API results in 
            * an error
            */        
            function displayPleiadesError(jqXHR, textStatus, errorThrown) {
                $('#'+widgetContext.widgetID+'-content').empty();
                if (jqXHR.status == '404') { 
                    var data = {title: config.MSG_TITLE_PLACE_NOT_FOUND,
                                msg: config.MSG_PLACE_NOT_FOUND};       
                } else { 
                    var data = {title: config.MSG_TITLE_PLEIADES_TIMEOUT,
                                msg: config.MSG_PLEIADES_TIMEOUT};                
                }
                
                var html = Handlebars.templates['error'](data);
                $('#'+widgetContext.widgetID+'-content').append(html);
            }

           /**
            * Callback to use display the data from Pleiades, including
            * plotting the location on the Google Map
            */ 
            function displayPleiadesData(data) {
                var altNames = false;
                if (data.names.length > 1) {
                    altNames = data.names.join(', '); 
                }
               
                var placeData= {title: data.names[0] ? data.names[0] : 'Untitled',
                                description: data.description,
                                altNames: altNames, 
                                pleiadesID: data.id,
                                widgetContext: widgetContext};


                var html = Handlebars.templates['pleiades'](placeData);
                $('#'+widgetContext.widgetID+'-pleiades').append(html);
            
                // Add the Google map - we need to do this here so that we can refresh#
                // it when the widget is opened
                if (data.reprPoint != null && widgetContext.displayMap) {  
                    placeMap = new place_map.PlaceMap(widgetContext.widgetID+'-map_canvas');
                    placeMap.setMarker(data.reprPoint, data.names[0]);  
                    
                }
                
                if (data.reprPoint == null) {
                    placeMap = null;
                }
                
                showPlace();
            }   
        }
        
       /**
        * Add Pelagios partner data to a Pelagios widget
        */    
        function showPelagiosData(pleiadesID) {                   
            var pelagiosURL = config.URL_PELAGIOS_API_V2 +"places/"+
                                  encodeURIComponent(config.URL_PLEIADES+pleiadesID)+"/datasets.json?callback=?";
            util.getAPIData(pelagiosURL, displayPelagiosData, false, 
                       config.TIMEOUT_PELAGIOS, false);  

           /**
            * Display data from Pelagios partners
            * json - the data returned by the Pelagios Graph Explorer API for the
            * specified location
            */        
            function displayPelagiosData(json) { 
                // Loop through the root datasets 
                $.each(json, function(key, rootDataset) {
                    // If there are only results in one subset then
                    // the subset is returned, not the root dataset, 
                    // so need to replace with the root dataset
                    if (rootDataset.hasOwnProperty('root_dataset')) {
                        rootDataset = rootDataset.root_dataset;
                    }
                     
                    var rootDatasetInfo; 
                    rootDatasetID = rootDataset.uri.replace(/http:\/\/pelagios.dme.ait.ac.at\/api\/datasets\//g, '');
                    rootDatasetInfo = getDatasetInfo(rootDatasetID);

                    if (typeof rootDatasetInfo !== 'undefined') {                     
                        // Add a section for the current root dataset
                        addSection(rootDatasetID, rootDatasetInfo.title, 
                                   widgetContext.iconDir+rootDatasetInfo.iconFileName, 
                                   rootDatasetInfo.strapline) ;

                        // Put all the subset information into an array           
                        var subdataset = new Array(); 
                        if (typeof rootDataset.subsets !== 'undefined') {                           
                            for (var i = 0; i < rootDataset.subsets.length; i++) {
                                subdataset[i] = {};
                                subdataset[i].widgetContext = widgetContext;
                                subdataset[i].title         = rootDataset.subsets[i].title;
                                subdataset[i].id            = rootDataset.subsets[i].uri.replace(/http:\/\/pelagios.dme.ait.ac.at\/api\/datasets\//g, '');
                                subdataset[i].references    = rootDataset.subsets[i].annotations_referencing_place;
                                subdataset[i].multipleReferences = (subdataset[i].references > 1 ) ? true : false;
                                subdataset[i].anyReferences = (subdataset[i].references > 0) ? true : false;
                            }
                        } else { // If no subdatasets, then create one for the
                                 // root dataset
                            subdataset[0] = {};
                            subdataset[0].widgetContext = widgetContext;
                            subdataset[0].title         = rootDataset.title;
                            subdataset[0].id            = rootDatasetID;  
                            subdataset[0].references    =   json[key].annotations_referencing_place;  
                                                       
                            subdataset[0].multipleReferences = (subdataset[0].references > 1 ) ? true : false;
                        }
                        
                        
                        
                        // Now add the HTML for the root datasets and divs 
                        // to hang the subdataset info on
                        var data = {subdataset: subdataset, 
                                    rootDatasetID: rootDatasetID,
                                    widgetContext: widgetContext};
                        var html = Handlebars.templates['pelagios_partner'](data);
                        $('#'+widgetContext.widgetID+'-content-'+rootDatasetID).append(html);
                        $('#'+widgetContext.widgetID+'-subdatasets-'+rootDatasetID).
                          css('list-style-image', 
                          'url('+widgetContext.imageDir+'icons/bullet.png)');
                        
                        // Add the handler to open and close each subdataset 
                        // content and start with the content hidden
                        for (var i = 0; i < subdataset.length; i++) {
                           subdatasetSetup(subdataset[i]);                             
                        } 
                    } else {
                        debug('ERROR: Could not find info for root dataset '+rootDataset.title+' '+pelagiosURL);
                    }                    
                });
            } 
            
            function subdatasetSetup(subdataset) {
                $('#'+widgetContext.widgetID+'-subdataset_title-'+
                  subdataset.id).click(
                                         {id: subdataset.id},
                                         clickDisplaySubdataset);                            
                $('#'+widgetContext.widgetID+'-subdataset_content-'+
                  subdataset.id).hide();    
                
                var callback = function(newPageIndex) {
                    handlePaginationClick(newPageIndex, subdataset.id); 
                }
                
                $('#'+widgetContext.widgetID+
                  '-subdataset_pagination-'+
                  subdataset.id).pagination(
                  subdataset.references,
                  {items_per_page: config.NUM_ANNOTATIONS_TO_DISPLAY, 
                   callback:       callback,
                   next_show_always: false,
                   prev_show_always: false
                  }); 

                
                
                // Add the data for the first page of results
                handlePaginationClick(0, subdataset.id);                 
            }
            
            function handlePaginationClick(newPageIndex, subdatasetID) {
                var url = config.URL_PELAGIOS_API_V2+'datasets/'+
                          subdatasetID+
                          '/annotations.json?forPlace='+
                          encodeURIComponent(config.URL_PLEIADES+pleiadesID)+
                          "&limit="+config.NUM_ANNOTATIONS_TO_DISPLAY+
                          "&offset="+newPageIndex*config.NUM_ANNOTATIONS_TO_DISPLAY+
                          "&callback=?";                               
                // Need to use a closure to be able to get
                // at the subset ID
                var success = function(json) {
                    if (typeof json.annotations != 'undefined' &&
                        json.annotations.length > 0) {
                        displayAnnotations(json.annotations, subdatasetID);
                    }
                }

                util.getAPIData(url, success);
                return false;
            }
            
            function displayAnnotations(annotations, subsetID) {
                var annotation = new Array();

                $.each(annotations, function (key, val) {
                   annotation[key] = {};
                   if (val.hasOwnProperty('target_title')) {
                     annotation[key].label = val.target_title;
                   } else {
                     annotation[key].label = val.title ? val.title : 'Item ' + (key + 1);
                   }
                   annotation[key].uri = val.hasTarget;
                 });
                 var data = {
                   subdatasetID: subsetID,
                   annotation: annotation,
                   widgetContext: widgetContext
                 };
                 var html = Handlebars.templates['annotations'](data);
                 
                 $('#' + widgetContext.widgetID + '-annotations-' + subsetID).empty();
                 $('#' + widgetContext.widgetID + '-annotations-' + subsetID).append(html);
                 $('#' + widgetContext.widgetID + '-subdataset-' + subsetID).focus();   
            } 
           /**
            * Callback function when somebody clicks to view hits for a subdataset
            */
            function clickDisplaySubdataset(data) {   
                var subdatasetID = data.data.id;
                // If the annotations pane is open, underline the number of hits, 
                // if it is closed, remove the underline
                toggleSelectedLink(widgetContext.widgetID+'-subdataset_hits-'+
                                    subdatasetID)
                // Show or hide the subdataset content
                $('#'+widgetContext.widgetID+'-subdataset_content-'+
                  subdatasetID).toggle();  
                toggleIcon(widgetContext.widgetID+'-toggle-subdataset-'+
                           subdatasetID);
            }
            
           /**
            * Hide a subdataset pane
            */
            function hideSubdataset(id) {
                $('#'+widgetID+'-subdataset_content-'+id).hide(); 
            }
        }
 
        function displaySearchResults() {

            var pelagiosURL = config.URL_PELAGIOS_API_V2+'search.json?query='+
                              searchString+'&callback=?';

            debug('RETRIEVING SEARCH DATA: searchString: '+searchString+' URL:'+pelagiosURL);        
            util.getAPIData(pelagiosURL, displaySearchResultsData, 
                            false, config.TIMEOUT_PELAGIOS, false);
        }
      
        function displaySearchResultsData(json) {
            $('#'+widgetContext.widgetID+'-search-map').empty();
            $('#'+widgetContext.widgetID+'-search-results').empty();
            $('#'+widgetContext.widgetID+'-pleiades').empty();
            $('#'+widgetContext.widgetID+'-sections').empty();
             
            if (json.length > 0) {
                // Put the data into a more useful form
                var places = new Array();
                $.each(json, function(key, val) { 
                    place = {};
                    place.label = val.label;
                    place.pleiadesID = val.uri.replace(/.*places.*F/g, '');
                    place.geojson = val;
                    if (val.feature_type) {
                    place.feature_type = val.feature_type.replace(/.*place-types\//g, '');
                    } 
                    place.content = '<h2>'+place.label+'</h2>';
                    place.content += '<p id="'+widgetContext.widgetID+'-info-'+
                                     place.pleiadesID+'">View info</p>';
                    place.widgetID = widgetContext.widgetID;  //Hack                             
                    places[key] = place;
                });
                
                var data = {place: places, widgetContext: widgetContext, searchString: searchString}
                // Display the search results
                var html = Handlebars.templates['search_results'](data);
                $('#'+widgetContext.widgetID+'-search-results').append(html);
                
                // Add the icons background-image
                $('.pelagios .list-results li').css('background-image', 
                'url('+widgetContext.imageDir+'place_type_icons/unknown.png)');
                var place_type_icons = {'temple':'temple.png', 
                                        'santuary':'sanctuary.png',
                                        'river': 'river.png',
                                        'water-open' : 'river.png',
                                        'mountain' : 'mountain.png',
                                        'island' : 'island.png',
                                        'tribe' : 'tribe.png',
                                        'settlement' : 'settlement.png',
                                        'urban' : 'settlement.png',
                                        'people' : 'people.png',
                                        'aqueduct' : 'aqueduct.png',
                                        'cape': 'cape.png',
                                        'mine': 'mine.png',
                                        'station' : 'port.png',
                                        'road' : 'road.png',
                                        'villa' : 'villa.png',
                                        'wall' : 'wall.png',
                                        'province' : 'people.png'
                                        
                                        };
                $.each(place_type_icons, function(place, image) {
                    $('.pelagios .list-results li.'+place).css('background-image', 
                         'url('+widgetContext.imageDir+'place_type_icons/'+image+')');
                });

                
                if (widgetContext.displayMap) {            
                    searchMap = new search_map.SearchMap(widgetContext.widgetID +
                                    "-search-map_canvas");  
                }
                           
                $.each(places, function(key, place) {
                    if (widgetContext.displayMap) {    
                        searchMap.addMarker(place.geojson, place.label, 
                                            place.content, function() {
                                                onClickHandler(place.pleiadesID);
                                            }); 
                    }

                    $('#'+widgetContext.widgetID+'-place-'+place.pleiadesID).click(
                        function() {
                            onClickHandler(place.pleiadesID);
                        }); 
                });
                
                function onClickHandler(pleiadesID) {
                    $('.pelagios-search-result-list li').css('text-decoration', 'none');
                     $('.pelagios-search-result-list li').css('font-weight', 'normal');
                    $('#'+widgetContext.widgetID+'-place-'+pleiadesID).css('text-decoration', 'underline');
                    $('#'+widgetContext.widgetID+'-place-'+pleiadesID).css('font-weight', 'bold');
                    displayPlace(pleiadesID);
                }
                
                showSearchResults();
            } else { // No results
                $('#'+widgetContext.widgetID+'-search-results').append("<h3 class='no-search-results'>No matches found for '"+searchString+"'</h3>");
                $('#'+widgetContext.widgetID+'-search-results').show();
            }
        }
        
        function hideSearchResults() {
             $('#'+widgetContext.widgetID+'-search-results-map').hide();
             $('#'+widgetContext.widgetID+'-search-results').hide();
        }
        
        function showSearchResults() {
            if (widgetContext.displayMap) {
                
                $('#'+widgetContext.widgetID+'-search-results-map').show();
                searchMap.refresh();
            }
            $('#'+widgetContext.widgetID+'-search-results').show();
        }
        
        function hidePlace() {
            $('#'+widgetContext.widgetID+'-map').hide();
            $('#'+widgetContext.widgetID+'-place').hide();
        }
        
        function showPlace() {
            $('#'+widgetContext.widgetID+'-place').show();
            
            //Display the search map
            if (widgetContext.displayMap && placeMap != null) {
                $('#'+widgetContext.widgetID+'-map').show();
                placeMap.refresh();
            }
            
            if (placeMap == null) {
                $('#'+widgetContext.widgetID+'-map').hide();
            }
        }
        
        /**
         * Add a new section to the widget
         * name - the name of the section to use in the HTML id for the section
         * title - title to be displayed for the section
         * iconURL - URL of the icon to be displayed
         * strapline - strapline to display for the section
         */          
         function addSection(name, title, iconURL, strapline) {
             var data = {name:name, 
                         title:title, 
                         iconURL: iconURL, 
                         strapline:strapline,
                         widgetContext: widgetContext};

            var html = Handlebars.templates['section'](data);
            $('#'+widgetContext.widgetID+'-sections').append(html);
             // Start with the contents hidden
             $('#'+widgetContext.widgetID+'-content-'+name).hide();             
             // Handler to toggle section open and closed
             $('#'+widgetContext.widgetID+'-header-'+name).click(function() {
                 $('#'+widgetContext.widgetID+'-content-'+name).toggle();
                 toggleIcon(widgetContext.widgetID+'-toggle-'+name)  
             })
         }    



         function toggleIcon(id) {
             var current_icon = $('#'+id).attr("src"); 
             var new_icon = (current_icon == widgetContext.imageDir+'icons/down-arrow.png' ? 
                         widgetContext.imageDir+'icons/right-arrow.png' : 
                         widgetContext.imageDir+'icons/down-arrow.png');
             $('#'+id).attr("src", new_icon); 
         }


         function toggleSelectedLink(id) {
             var element = $('#'+ id);
             var current_style = element.css('text-decoration');
             var new_style = current_style  == 'underline' ? 'none' : 
                                                             'underline';
             element.css('text-decoration', new_style);
        }
        
        function getDatasetInfo(id) {
            var datasetInfo;
            $.each(dataset, function (key, info) {  
                if (info.id == rootDatasetID) {
                    datasetInfo = info;
                }
            });
            return datasetInfo;
        }
        
        function debug(msg) {
            if (widgetContext.debug) {
                console.log(msg);
            }
        }
    }

    return {Widget: Widget};    

});

