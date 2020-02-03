'use strict';

WaveSurfer.WebAudio = {
    scriptBufferSize: 256,
    PLAYING_STATE: 0,
    PAUSED_STATE: 1,
    FINISHED_STATE: 2,
	
	DECAY_MAX: 10,
	
	FFT_BUFSIZE: 4096,
	
	browser: 'other',
	
	channels: 0,
	
	fftwolaL: 0,
	fftwolaR: 0,	

    supportsWebAudio: function () {
        return !!(window.AudioContext || window.webkitAudioContext);
    },

    getAudioContext: function () {
        if (!WaveSurfer.WebAudio.audioContext) {
            WaveSurfer.WebAudio.audioContext = new (
                window.AudioContext || window.webkitAudioContext
            );
        }
        return WaveSurfer.WebAudio.audioContext;
    },

    getOfflineAudioContext: function (sampleRate) {
        if (!WaveSurfer.WebAudio.offlineAudioContext) {
            WaveSurfer.WebAudio.offlineAudioContext = new (
                window.OfflineAudioContext || window.webkitOfflineAudioContext
            )(1, 2, sampleRate);
        }
        return WaveSurfer.WebAudio.offlineAudioContext;
    },

	
	setBrowser: function(s) {
		this.browser = s;		
	}, 
	
    init: function (params) {
        this.params = params;
        this.ac = params.audioContext || this.getAudioContext();

        this.lastPlay = this.ac.currentTime;
        this.startPosition = 0;
        this.scheduledPause = null;
		
		this.attack = 0;
		this.hold = 0;
		this.decay = this.DECAY_MAX;
		
		this.fftwolaL = new fftwola(this.FFT_BUFSIZE, 8, this.ac.sampleRate);
		this.fftwolaR = new fftwola(this.FFT_BUFSIZE, 8, this.ac.sampleRate);
		
        this.states = [
            Object.create(WaveSurfer.WebAudio.state.playing),
            Object.create(WaveSurfer.WebAudio.state.paused),
            Object.create(WaveSurfer.WebAudio.state.finished)
        ];

        this.createVolumeNode();
        this.createScriptNodes();
        this.createAnalyserNode();

		this.createPreGain();
		
		var my = this;

		this.addCustomProcess(this.customProcessor);
	
		//this.setFilters([this.preGainNode, this.customProcessor]);
		
        this.setState(this.PAUSED_STATE);
        this.setPlaybackRate(this.params.audioRate);
    },

    disconnectFilters: function () {
        if (this.filters) {
            this.filters.forEach(function (filter) {
                filter && filter.disconnect();
            });
            this.filters = null;
            // Reconnect direct path
            this.analyser.connect(this.gainNode);
        }
    },

    setState: function (state) {
        if (this.state !== this.states[state]) {
            this.state = this.states[state];
            this.state.init.call(this);
        }
    },

    // Unpacked filters
    setFilter: function () {
        this.setFilters([].slice.call(arguments));
    },

    /**
     * @param {Array} filters Packed filters array
     */
    setFilters: function (filters) {
        // Remove existing filters
        this.disconnectFilters();

        // Insert filters if filter array not empty
        if (filters && filters.length) {
            this.filters = filters;
            // Disconnect direct path before inserting filters
            this.analyser.disconnect();

            // Connect each filter in turn
            filters.reduce(function (prev, curr) {
                prev.connect(curr);
                return curr;
            }, this.analyser).connect(this.gainNode);
        }

    },

    createScriptNodes: function () {
        if (this.ac.createScriptProcessor) {
            this.scriptNode = this.ac.createScriptProcessor(this.scriptBufferSize);
			this.customProcessor = this.ac.createScriptProcessor(this.FFT_BUFSIZE);
        } else {
            this.scriptNode = this.ac.createJavaScriptNode(this.scriptBufferSize);
			this.customProcessor = this.ac.createJavaScriptNode(this.FFT_BUFSIZE);
        }

        this.scriptNode.connect(this.ac.destination);
    },

    addOnAudioProcess: function () {
        var my = this;
		if(this.browser == 'other') {
			this.scriptNode.onaudioprocess = function () {
			var time = my.getCurrentTime();
			if (time >= my.scheduledPause) { 
				my.setPreGain(0);
				my.setState(my.PAUSED_STATE);
				my.source.stop(0);
				my.fireEvent('pause');
			}

			else if (my.state === my.states[my.PLAYING_STATE]) {
					my.fireEvent('audioprocess', time);
				}
			};
		}
		
		else {  
			// chrome/opera playback
			this.scriptNode.onaudioprocess = function () {
				var time = my.getCurrentTime();
				if (time >= my.scheduledLoopPoint) {
				    my.un('audioprocess'); // we don't want cursor to move past our loop point
				} else if (my.state === my.states[my.PLAYING_STATE]) {
					my.fireEvent('audioprocess', time);
				}
			};		
		}
		
    },
	
    removeOnAudioProcess: function () {
        this.scriptNode.onaudioprocess = null;
    },

	addCustomProcess: function(c) {
		var my = this;
		c.onaudioprocess = function(ae) {
			if(my.channels == 1) {
				var in1 = ae.inputBuffer.getChannelData(0);
				var out1 = ae.outputBuffer.getChannelData(0);
				my.fftwolaL.process(in1, out1);	
			}
			else {
				var in1 = ae.inputBuffer.getChannelData(0);
				var in2 = ae.inputBuffer.getChannelData(1);
				var out1 = ae.outputBuffer.getChannelData(0);
				var out2 = ae.outputBuffer.getChannelData(1);
				my.fftwolaL.process(in1, out1);	
				my.fftwolaR.process(in2, out2);
			}			
		};
	},
	
	removeCustomProcess : function() {
		this.customProcessor.onaudioprocess = null;
	},
	
	
    createAnalyserNode: function () {
        this.analyser = this.ac.createAnalyser();
        this.analyser.connect(this.gainNode);
    },

    /**
     * Create the gain node needed to control the playback volume.
     */
    createVolumeNode: function () {
        // Create gain node using the AudioContext
        if (this.ac.createGain) {
            this.gainNode = this.ac.createGain();
        } else {
            this.gainNode = this.ac.createGainNode();
        }
        // Add the gain node to the graph
        this.gainNode.connect(this.ac.destination);
    },


	createPreGain: function () {
        if (this.ac.createGain) {
            this.preGainNode = this.ac.createGain();
        } else {
            this.preGainNode = this.ac.createGainNode();
        }		
	},


    /**
     * Set the gain to a new value.
     *
     * @param {Number} newGain The new gain, a floating point value
     * between 0 and 1. 0 being no gain and 1 being maximum gain.
     */
    setVolume: function (newGain) {
        this.gainNode.gain.value = newGain;
    },


	
   setPreGain: function (newGain) {
        this.preGainNode.gain.value = newGain;
    },	
	

	
	setBrowser: function(s){
		this.browser = s;
	},
	
    /**
     * Get the current gain.
     *
     * @returns {Number} The current gain, a floating point value
     * between 0 and 1. 0 being no gain and 1 being maximum gain.
     */
    getVolume: function () {
        return this.gainNode.gain.value;
    },

    decodeArrayBuffer: function (arraybuffer, callback, errback) {
        if (!this.offlineAc) {
            this.offlineAc = this.getOfflineAudioContext(this.ac ? this.ac.sampleRate : 44100);
        }
        this.offlineAc.decodeAudioData(arraybuffer, (function (data) {
            callback(data);
        }).bind(this), errback);
    },

    /**
     * Compute the max and min value of the waveform when broken into
     * <length> subranges.
     * @param {Number} How many subranges to break the waveform into.
     * @returns {Array} Array of 2*<length> peaks or array of arrays
     * of peaks consisting of (max, min) values for each subrange.
     */
    getPeaks: function (length) {
        var sampleSize = this.buffer.length / length;
        var sampleStep = ~~(sampleSize / 10) || 1;
        var channels = this.buffer.numberOfChannels;
        var splitPeaks = [];
        var mergedPeaks = [];

        for (var c = 0; c < channels; c++) {
            var peaks = splitPeaks[c] = [];
            var chan = this.buffer.getChannelData(c);

            for (var i = 0; i < length; i++) {
                var start = ~~(i * sampleSize);
                var end = ~~(start + sampleSize);
                var min = chan[0];
                var max = chan[0];

                for (var j = start; j < end; j += sampleStep) {
                    var value = chan[j];

                    if (value > max) {
                        max = value;
                    }

                    if (value < min) {
                        min = value;
                    }
                }

                peaks[2 * i] = max;
                peaks[2 * i + 1] = min;

                if (c == 0 || max > mergedPeaks[2 * i]) {
                    mergedPeaks[2 * i] = max;
                }

                if (c == 0 || min < mergedPeaks[2 * i + 1]) {
                    mergedPeaks[2 * i + 1] = min;
                }
            }
        }

        return this.params.splitChannels ? splitPeaks : mergedPeaks;
    },

    getPlayedPercents: function () {
        return this.state.getPlayedPercents.call(this);
    },

    disconnectSource: function () {
        if (this.source) {
            this.source.disconnect();
        }
    },

	freeBuffers: function() {
		this.fftwolaL.dispose();
		this.fftwolaR.dispose();		
	},	
	
	
    destroy: function () {
        if (!this.isPaused()) {
            this.pause();
        }
        this.unAll();
        this.buffer = null;
        this.disconnectFilters();
        this.disconnectSource();
        this.gainNode.disconnect();
        this.scriptNode.disconnect();
        this.analyser.disconnect();
		this.freeBuffers();
    },

    load: function (buffer) {
        this.startPosition = 0;
        this.lastPlay = this.ac.currentTime;
        this.buffer = buffer;
		this.channels = buffer.numberOfChannels;
        this.createSource(false);	
    },

    createSource: function (initFilters) {
        this.disconnectSource();
        this.disconnectFilters();		
		if(initFilters) this.setFilters([this.preGainNode, this.customProcessor]); 
		/* 
		 ^ because in firefox, a script processor node connected to absolutely anything fires constantly		
		*/
        this.source = this.ac.createBufferSource();

        //adjust for old browsers.
        this.source.start = this.source.start || this.source.noteGrainOn;
        this.source.stop = this.source.stop || this.source.noteOff;

        this.source.playbackRate.value = this.playbackRate;
        this.source.buffer = this.buffer;
        this.source.connect(this.analyser);
    },
	
    isPaused: function () {
        return this.state !== this.states[this.PLAYING_STATE];
    },

    getDuration: function () {
        if (!this.buffer) {
            return 0;
        }
        return this.buffer.duration;
    },

    seekTo: function (start, end) {
        this.scheduledPause = null;

        if (start == null) {
            start = this.getCurrentTime();
            if (start >= this.getDuration()) {
                start = 0;
            }
        }
        if (end == null) {
            end = this.getDuration();
        }

        this.startPosition = start;
        this.lastPlay = this.ac.currentTime;

        if (this.state === this.states[this.FINISHED_STATE]) {
            this.setState(this.PAUSED_STATE);
        }

        return { start: start, end: end };
    },

    getPlayedTime: function () {
        return (this.ac.currentTime - this.lastPlay) * this.playbackRate;
    },

    /**
     * Plays the loaded audio region.
     *
     * @param {Number} start Start offset in seconds,
     * relative to the beginning of a clip.
     * @param {Number} end When to stop
     * relative to the beginning of a clip.
     */
    play: function (start, end) {
        // need to re-create source on each playback
        this.createSource(true);
		this.setPreGain(1);
        var adjustedTime = this.seekTo(start, end);

        start = adjustedTime.start;
        end = adjustedTime.end;

        this.scheduledPause = end;

        this.source.start(0, start, end - start);

        this.setState(this.PLAYING_STATE);

        this.fireEvent('play');
    },

	
	slices: [],
	
	resetSlices: function() {
		this.slices = [];	
	},
	
	
	getSlices: function() {
		return this.slices;
	},
	
	
	render: function(start, end, index) {
		var frames= Math.floor((end - start) * this.ac.sampleRate / this.playbackRate);  // 
		var ctx = new OfflineAudioContext(this.buffer.numberOfChannels, frames, this.ac.sampleRate); 
		var my = this;
		this.source = ctx.createBufferSource();
		this.source.start = this.source.start || this.source.noteGrainOn;
		this.source.stop = this.source.stop || this.source.noteOff;
		this.source.buffer = this.buffer;
		this.source.playbackRate.value = this.playbackRate;	
		this.source.connect(ctx.destination);
		this.source.start(0,start); 
		ctx.startRendering();
		var index = index;
		ctx.oncomplete = function(e) {
			my.runOfflineProcessing(e.renderedBuffer);
			my.slices.push({slice: e.renderedBuffer, index: index});
			my.fireEvent("render", e.renderedBuffer);
		}
	},	 
	

	runOfflineProcessing: function(buffer) {
		this.fftwolaL.reset();
		if(this.channels == 2) this.fftwolaR.reset();		
		var l, r;
		l = buffer.getChannelData(0);
		if(this.channels == 2) r = buffer.getChannelData(1);
		var blocks = Math.ceil(buffer.length/this.FFT_BUFSIZE);
		var inputBufferL = new Float32Array(this.FFT_BUFSIZE);
		var inputBufferR = new Float32Array(this.FFT_BUFSIZE);
		var outputBufferL = new Float32Array(this.FFT_BUFSIZE);
		var outputBufferR = new Float32Array(this.FFT_BUFSIZE);	
		
		for(var y=0; y < outputBufferL.length; y++) {
			outputBufferL[y] = 0.0;
			outputBufferR[y] = 0.0;			
		}

		for(var x = 0; x<blocks; x++) {
			var start = this.FFT_BUFSIZE * x;
			var end = start + this.FFT_BUFSIZE;
			if(end > l.length) {  // reached the end bit that is smaller than our buffer
				inputBufferL.set(l.slice(start,l.length), 0);
				inputBufferL.fill(0.0, l.length-start);
				if(this.channels == 2) {
					inputBufferR.set(r.slice(start,r.length), 0);
					inputBufferR.fill(0.0, r.length-start);
				}
			}
			else {
				inputBufferL.set(l.slice(start,end), 0);
				if(this.channels == 2) inputBufferR.set(r.slice(start,end), 0);		
			}	
			
			this.fftwolaL.process(inputBufferL, outputBufferL);
			if(this.channels == 2) this.fftwolaR.process(inputBufferR, outputBufferR);
			
			if(end > l.length) {
				l.set(outputBufferL.slice(0,l.length-start), start);
				if(this.channels == 2) r.set(outputBufferR.slice(0,r.length-start), start);					
			}
			else {
				l.set(outputBufferL,start);
				if(this.channels == 2) r.set(outputBufferR,start);
			}
		}
		
		
		var g = this.gainNode.gain.value;
		for(var x=0; x < l.length; x++) {
			l[x] *= g;
			if(l[x] > 1.0) l[x] = 1.0;
			if(l[x] < -1.0) l[x] = -1.0;
			if(this.channels == 2) {
				r[x] *= g;	
				if(r[x] > 1.0) r[x] = 1.0;
				if(r[x] < -1.0) r[x] = -1.0;
			}
		}
	},
	
	
	
	playExtended: function (start, loop, end, render, index, loopback) {   // end = extended end, loop = end of segment 
		if(render == true) {
			this.render(start, loop, index);
			return;
		}
		var my = this;
        this.createSource(true);
		this.setPreGain(1);
        if(loopback == 0) {
            this.fftwolaL.reset();
            if(this.channels == 2) this.fftwolaR.reset();
        }
        var adjustedTime = this.seekTo(start, end);
		this.scheduledLoopPoint = loop;
        this.scheduledPause = end;  
		this.preGainNode.gain.cancelScheduledValues(0);	
		this.source.start(0,start); 
		if(this.browser == "chrome-opera") {
			var length = (end - start)  / this.playbackRate;
			var loopPt = (loop - start) / this.playbackRate;
			this.preGainNode.gain.setValueAtTime(0.0, this.ac.currentTime + loopPt);	
			this.source.stop(this.ac.currentTime + length); 
			this.source.onended = function() {
				my.setState(my.PAUSED_STATE);
				my.fireEvent('pause');		
			};
		}
		/* 
		Chrome and Opera seem to give the most accurate timing with the above method; Firefox stops slightly short. But letting WaveSurfer's 
		monitoring scriptprocessor ascertain when to stop makes Firefox (& default browsers) err on playing slightly too much rather than too little. 
		If it stops short of playing the full segment, it may miss glitches at the end that later get rendered.
		*/ 
        this.setState(this.PLAYING_STATE);
        this.fireEvent('play');
    },	

    /**
     * Pauses the loaded audio.
     */
    pause: function () {
        this.scheduledPause = null;

        this.startPosition += this.getPlayedTime();
        this.source && this.source.stop(0);

        this.setState(this.PAUSED_STATE);

        this.fireEvent('pause');
    },

    /**
    *   Returns the current time in seconds relative to the audioclip's duration.
    */
    getCurrentTime: function () {
        return this.state.getCurrentTime.call(this);
    },

    /**
     * Set the audio source playback rate.
     */
    setPlaybackRate: function (value) {
        value = value || 1;
        if (this.isPaused()) {
            this.playbackRate = value;
        } else {
            this.pause();
            this.playbackRate = value;
            this.play();
        }
    }
};

WaveSurfer.WebAudio.state = {};

WaveSurfer.WebAudio.state.playing = {
    init: function () {
       this.addOnAudioProcess();
    },
    getPlayedPercents: function () {
        var duration = this.getDuration();
        return (this.getCurrentTime() / duration) || 0;
    },
    getCurrentTime: function () {
        return this.startPosition + this.getPlayedTime();
    }
};

WaveSurfer.WebAudio.state.paused = {
    init: function () {
        this.removeOnAudioProcess();
		this.disconnectFilters();
    },
    getPlayedPercents: function () {
        var duration = this.getDuration();
        return (this.getCurrentTime() / duration) || 0;
    },
    getCurrentTime: function () {
        return this.startPosition;
    }
};

WaveSurfer.WebAudio.state.finished = {
    init: function () {
        this.removeOnAudioProcess();
		this.disconnectFilters();
        this.fireEvent('finish');
    },
    getPlayedPercents: function () {
        return 1;
    },
    getCurrentTime: function () {
        return this.getDuration();
    }
};

WaveSurfer.util.extend(WaveSurfer.WebAudio, WaveSurfer.Observer);
