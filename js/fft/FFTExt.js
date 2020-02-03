"use strict";

var FFTExtModule = FFTExtModule({});

var kiss_fftr_alloc = FFTExtModule.cwrap(
    'kiss_fftr_alloc', 'number', ['number', 'number', 'number', 'number' ]
);

var kiss_fftr = FFTExtModule.cwrap(
    'kiss_fftr', 'void', ['number', 'number', 'number' ]
);

var kiss_fftri = FFTExtModule.cwrap(
    'kiss_fftri', 'void', ['number', 'number', 'number' ]
);

var kiss_fftr_free = FFTExtModule.cwrap(
    'kiss_fftr_free', 'void', ['number']
);

var kiss_fft_alloc = FFTExtModule.cwrap(
    'kiss_fft_alloc', 'number', ['number', 'number', 'number', 'number' ]
);

var kiss_fft = FFTExtModule.cwrap(
    'kiss_fft', 'void', ['number', 'number', 'number' ]
);

var kiss_fft_free = FFTExtModule.cwrap(
    'kiss_fft_free', 'void', ['number']
);

var rect_polar = FFTExtModule.cwrap(
    'rect_polar', 'void', ['number', 'number', 'number']
);

var rect_polar_zerophase = FFTExtModule.cwrap(
    'rect_polar_zerophase', 'void', ['number', 'number', 'number']
);

var polar_rect = FFTExtModule.cwrap(
    'polar_rect', 'void', ['number', 'number', 'number']
);


function FFTExt(size) {
    this.size = size;
    this.fcfg = kiss_fftr_alloc(size, false);
    this.icfg = kiss_fftr_alloc(size, true);
    
    this.rptr = FFTExtModule._malloc(size*4 + (size+2)*4);
    this.cptr = this.rptr + size*4;
    
    this.ri = new Float32Array(FFTExtModule.HEAPU8.buffer, this.rptr, size);
    this.ci = new Float32Array(FFTExtModule.HEAPU8.buffer, this.cptr, size+2);
    
    this.forward = function(real) {
		this.ri.set(real);
		kiss_fftr(this.fcfg, this.rptr, this.cptr);
		return new Float32Array(FFTExtModule.HEAPU8.buffer,
				this.cptr, this.size + 2);
    }
    
    this.inverse = function(cpx) {
		this.ci.set(cpx);
		kiss_fftri(this.icfg, this.cptr, this.rptr);
		return new Float32Array(FFTExtModule.HEAPU8.buffer,
				this.rptr, this.size);
    }
    
	this.rect_polar = function(re, im, size) {
		this.ri.set(re);
		this.ci.set(im);
		rect_polar(this.rptr, this.cptr, size);
		re.set(this.ri); 
		im.set(this.ci.slice(0,size));
	}
	
	this.rect_polar_zerophase = function(re, im, size) {
		this.ri.set(re);
		this.ci.set(im);
		rect_polar_zerophase(this.rptr, this.cptr, size);
		re.set(this.ri); 
		im.set(this.ci.slice(0,size));
	}
	
	this.polar_rect = function(re, im, size) {
		this.ri.set(re);
		this.ci.set(im);
		polar_rect(this.rptr, this.cptr, size);
		re.set(this.ri); 
		im.set(this.ci.slice(0,size));
	}	

    this.dispose = function() {
		FFTExtModule._free(this.rptr);
		kiss_fftr_free(this.fcfg);
		kiss_fftr_free(this.icfg);
    }
}
