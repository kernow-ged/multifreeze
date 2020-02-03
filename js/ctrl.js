var filename = "untitled";

var playbutton = document.querySelector('[data-action="play"]');
playbutton.onclick = function() {
    if(wavesurfer.isPlaying()) wavesurfer.stop();
	else wavesurfer.seekToAndPlayAll(wavesurfer.getCurrentTime()/wavesurfer.getDuration());  	
};

var savebutton = document.querySelector('[data-action="save"]');
savebutton.onclick = function() {
	if(wavesurfer.getSlicesBetweenLocators() == 0) {
		alert('Please adjust the L and R indicators to select audio (right locator is behind or on top of left locator)');
	}
    else {
	wavesurfer.seekToAndRenderAll(filename);
	savebutton.disabled=true;	
	}
};


document.addEventListener('DOMContentLoaded', function() {
	document.addEventListener('keydown', function(e) {
		if ( e.keyCode == 32 || e.keyCode == 0 ) {
			e.preventDefault();
			e.stopPropagation();
			document.getElementById('playbtn').click();
			var btns = document.getElementsByTagName("button");
			for (var i = 0; i < btns.length; i++) {
				btns[i].blur();
			}			
		}
	});
});

var zoominbutton = document.querySelector('[data-action="zoomin"]');
zoominbutton.onclick = function() {
	zoomoutbutton.disabled = false;
	var lvl = wavesurfer.params.minPxPerSec;
	lvl *= 1.5;
	if(lvl < 300) lvl = 300;
	if(lvl >= 1700) {
	lvl = 1700;
	zoominbutton.disabled = true;
	}
	wavesurfer.zoom(lvl);
};

var zoomoutbutton = document.querySelector('[data-action="zoomout"]');	
zoomoutbutton.onclick = function() {
	zoominbutton.disabled = false;
	var lvl = wavesurfer.params.minPxPerSec;
	lvl /= 1.5;
	if(lvl <= 300) {
	lvl = 50;
	zoomoutbutton.disabled = true;
	}
	wavesurfer.zoom(lvl);
};	
	

var ofile = document.querySelector('#openfile');	
ofile.onchange = function() {
	if (this.files.length) {
		wavesurfer.clearRegions();
        wavesurfer.loadBlob(this.files[0]);
		document.getElementById("filename").innerHTML = " " + this.files[0].name;
		filename = this.files[0].name;
		initControls();
        flip_all_switches('down');
    } else {
        wavesurfer.fireEvent('error', 'Not a file');
     }	
};
	
var logValue = function(position, minp, maxp, loval, hival) {
	var minv = Math.log(loval);
	var maxv = Math.log(hival);
	var scale = (maxv-minv) / (maxp-minp);
	return Math.exp(minv + scale*(position-minp));
};

	
var initControls = function() {	
	zoominbutton.disabled = false;
	zoomoutbutton.disabled = true;
};

document.addEventListener('DOMContentLoaded', initControls);

document.addEventListener('DOMContentLoaded', function() {
	if(bowser.chrome==true || bowser.opera==true) { 
	wavesurfer.setBrowser('chrome-opera');
	}
});

// Drag'n'drop
document.addEventListener('DOMContentLoaded', function () {
 
	var toggleActive = function (e, toggle) {
		e.stopPropagation();
		e.preventDefault();
		toggle ? e.target.classList.add('wavesurfer-dragover') :
		e.target.classList.remove('wavesurfer-dragover');
    };

    var handlers = {
        // Drop event
        drop: function (e) {
            toggleActive(e, false);

            // Load the file into wavesurfer
            if (e.dataTransfer.files.length) {
				wavesurfer.clearRegions();
                wavesurfer.loadBlob(e.dataTransfer.files[0]);
				document.getElementById("filename").innerHTML = " " + e.dataTransfer.files[0].name;
				filename = e.dataTransfer.files[0].name;
				// also set defaults again
				initControls();
                flip_all_switches('down');
            } else {
                wavesurfer.fireEvent('error', 'Not a file');
            }
        },

        // Drag-over event
        dragover: function (e) {
            toggleActive(e, true);
       },

        // Drag-leave event
        dragleave: function (e) {
           toggleActive(e, false);
        }
    };

    var dropTarget = document.querySelector('#waveform');
    Object.keys(handlers).forEach(function (event) {
        dropTarget.addEventListener(event, handlers[event]);
    });
});

