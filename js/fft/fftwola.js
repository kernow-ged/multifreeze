function fftwola(fftsize, overlap, samplerate) {	
	// fftsize and overlap should be, of course, powers of 2: overlap in the range 2--8 
	this.fftsize = fftsize;
	this.fftsize2 = fftsize * 2;
	this.overlap = overlap; 	
	this.samplerate = samplerate || 44100.0;
	this.frequnit = this.samplerate / this.fftsize;
	this.fft = new FFTExt(fftsize, samplerate);		

	this.outputAccumulator = new Float32Array(this.fftsize2);
	this.inputAccumulator = new Float32Array(this.fftsize2); 
	this.reals = new Float32Array(this.fftsize);
	this.imags = new Float32Array(this.fftsize);
	this.peaks = [];  
	this.peakindices = [];
	this.hannWindow = new Float32Array(this.fftsize);
	
	for(var i=0; i<this.fftsize; ++i) {
		this.hannWindow[i] = -0.5 * Math.cos(6.2831853 * (i/this.fftsize)) + 0.5;
	}
	
    this.freeze = new Array(this.fftsize/2 +1);    
    for(var i=0; i<this.fftsize/2 + 1; ++i) {
        this.freeze[i] = 0;
    }

    this.mag_mem = new Float32Array(this.fftsize/2 +1);   
    this.phase_mem = new Float32Array(this.fftsize/2 +1); 
    this.phase_diff = new Float32Array(this.fftsize/2 +1); 
    
    this.flushMemory = function() {
        for(var i=0; i<this.fftsize/2 + 1; ++i) {
        this.mag_mem[i] = 0.0;
        this.phase_mem[i] = 0.0;
        this.phase_diff[i] = 0.0;
        }           
    }; 
    
	this.reset = function() {
		for(var i=0; i < this.fftsize; ++i) {
			this.reals[i] = this.imags[i] = this.inputAccumulator[i] = this.outputAccumulator[i] = 0.0;
		}
		for(var i=this.fftsize; i < this.fftsize2; ++i) {
			this.outputAccumulator[i] = this.inputAccumulator[i] = 0.0;
		}	 
	};
	
	this.reset(); // go ahead + initialise everything 
	
	this.window = function() {
		for(var i=0; i<this.fftsize; ++i) {
			this.reals[i] *= this.hannWindow[i];
		}
	}

	this.dispose = function() {
		this.fft.dispose();
	};
	
	this.process = function(input, output) {
		for(var i=this.fftsize; i<this.fftsize2; ++i) {
			this.inputAccumulator[i] = input[i-this.fftsize];
		}
		var step = this.fftsize/this.overlap;
		var norm = 2.6/this.overlap;
		// the factor of 2.6 is to compensate for the hann-windowing
		for(var stage=0; stage<this.overlap; stage++) {
			var hop1 = step * (stage+1);
			var hop2 = step * stage;
			for(var i=0; i<this.fftsize; ++i) {
				this.reals[i] = this.inputAccumulator[i + hop1];
			}
			this.window();   
			var fftbuf = this.fft.forward(this.reals);
			// unpacking/uninterleaving 
			for (var i=0; i<fftbuf.length; i+=2) {
				this.reals[i >> 1] = fftbuf[i];
				this.imags[i >> 1] = fftbuf[i+1];
			}
			this.processSpectrum(); 		
			// reinterleave
			for (var i=0; i<fftbuf.length; i+=2) {
				fftbuf[i] = this.reals[i >> 1];
				fftbuf[i+1] = this.imags[i >> 1];
			}
			this.reals = this.fft.inverse(fftbuf);
			// post-processing windowing
			this.window();   
			for(var i=0; i<this.fftsize; ++i) {
				this.outputAccumulator[i + hop2] += this.reals[i] * norm;
			}
		}
		for(var i=0; i<this.fftsize; ++i) {
		output[i] = this.outputAccumulator[i];
		}
		// rotate accumulators by 1/2
		for(var i=0; i<this.fftsize; ++i) {
			this.outputAccumulator[i] = this.outputAccumulator[i+this.fftsize];
			this.inputAccumulator[i] = this.inputAccumulator[i+this.fftsize];
		}
		for(var i=this.fftsize; i<this.fftsize2; ++i) {
			this.outputAccumulator[i] = 0.0;
		}
	};
    

    this.set_freeze_state = function(start, end, val) {
        for(var x = start; x<=end; x++) {
            this.freeze[x] = val;  
        }
    };
        
    this.bands = [
        {start:1, end:10},
        {start:11, end:20},
        {start:21, end:30},
        {start:31, end:40},
        {start:41, end:50},
        {start:51, end:62},
        {start:63, end:76},
        {start:77, end:90},
        {start:91, end:106},
        {start:107, end:124},
        {start:125, end:144},
        {start:145, end:168},
        {start:169, end:198},
        {start:199, end:230},
        {start:231, end:268},
        {start:269, end:312},
        {start:313, end:368},
        {start:369, end:438},
        {start:439, end:528},
        {start:529, end:638},
        {start:639, end:768},
        {start:769, end:948},
        {start:949, end:1198},
        {start:1199, end:2048}
    ];
    
    this.setBand = function(band, setting) {
        for(var i=this.bands[band].start; i<=this.bands[band].end; ++i) {
            this.freeze[i] = setting;
        }
    };  
  
	this.processSpectrum = function() {
        this.fft.rect_polar(this.reals, this.imags, this.fftsize);	
        this.reals[0] = 0.0;        
        for(var i=1; i<this.fftsize/2 + 1; ++i) {
            if(this.freeze[i] == 1) {
                this.reals[i] = this.mag_mem[i];               
                this.imags[i] = this.phase_mem[i]; 
                this.phase_mem[i] += this.phase_diff[i];
                if(this.phase_mem[i] > 3.141592653) {
                    this.phase_mem[i] -= 6.2831853;
                }
                if(this.phase_mem[i] < -3.141592653) {
                    this.phase_mem[i] += 6.2831853;
                }
            }
            else {
                this.mag_mem[i] = this.reals[i];
                this.phase_diff[i] = this.imags[i] - this.phase_mem[i];
                this.phase_mem[i] = this.imags[i];                
            }
        }
        this.fft.polar_rect(this.reals, this.imags, this.fftsize);        
	};		
    
};	