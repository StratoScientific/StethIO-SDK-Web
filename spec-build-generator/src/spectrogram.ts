// See http://arc.id.au/Spectrogram.html for documentation

// import { ɵHttpInterceptingHandler } from "@angular/common/http";

// UNUSED Here is a possible webgl version of the spectorgram. I am trying to stick to a canvas one as the code will be more mainainable.
// https://github.com/googlecreativelab/chrome-music-lab/blob/master/spectrogram/src/javascripts/3D/visualizer.js
// https://musiclab.chromeexperiments.com/Spectrogram/


// I use https://medium.com/@clintpitzak/how-to-use-external-javascript-libraries-in-angular-8-247baacbdccf
// to load Spectrogram-1v00.js

declare var Waterfall: any;

class SpectrogramDrawer {
    divID: string;
    context: AudioContext;
    analyserNode: AnalyserNode;

    frqBuf: Uint8Array;
    floatFreqData: Float32Array;
    floatTimeData: Float32Array;
    wfNumPts: number;
    wfBufAry: Array<Uint8Array>;
    wf: any;

    desiredMaxDB: number;
    gain: number;

    // change - cast to HTMLCanvasElement so we can call canvas.getContext
    canvas: HTMLCanvasElement;
    targetWidth: number;
    targetHeight: number;
    canvasContextXX: CanvasRenderingContext2D;
    playing: boolean;
    mode: 'HEART' | 'LUNG' = 'HEART';

    /**
     * @constructor
     * @param  {number} length Buffer length in frames.
     * @param  {number} channelCount Buffer channel count.
     */
    constructor(context, divID, heartMode) {
        // these DO NOT Wrap
        // (well I wrap them after hours so I don't run into an 11.6 hour max, so readIndex and _writeIndex can 'only' be a maximum of a ~5 hours apart)
        this.divID = divID;
        if (heartMode) {
            this.mode = 'HEART';
        } else {
            this.mode = 'LUNG';
        }

        this.context = context;
        this.analyserNode = this.context.createAnalyser();
       // this.analyserNode.smoothingTimeConstant = this.analyserNode.smoothingTimeConstant/4.0;
        this.analyserNode.fftSize = 2048; // 4096
        this.analyserNode.smoothingTimeConstant = 0.0;

        this.frqBuf = new Uint8Array(this.analyserNode.frequencyBinCount); //
        this.floatFreqData = new Float32Array(this.analyserNode.frequencyBinCount);
        this.floatTimeData = new Float32Array(this.analyserNode.frequencyBinCount);
        this.wfNumPts = 400; // 10*analyserNode.frequencyBinCount/128; // 400 +ve freq bins
        this.wfBufAry = [this.frqBuf];
        console.log(divID);
        console.log(document.getElementById(divID));
        this.canvas = <HTMLCanvasElement> document.getElementById(divID);
        // set here. You can't change the size of the target rect dynamically, you have to make a new SpectrogramDrawer
        const targetRect = this.canvas.getBoundingClientRect();
        // TODO: Hide below if RPM exams
        // this.targetWidth = 2*targetRect.width;// attempt at retina resolution, but seems not done yet
        // this.targetHeight = 2*targetRect.height;
        // TODO: Undide below if RPM calls
        this.targetWidth = Math.floor(targetRect.width);
        this.targetHeight = Math.floor(targetRect.height); // -260
        // this.wf = new Waterfall(this.wfBufAry, 400, 700, "right", {});
        this.wf = new StethIOSpectrogram(this.wfBufAry, this.targetWidth, this.targetHeight, {}, this, heartMode);

        this.desiredMaxDB = 0;
        this.gain = 1.0; // DB to add to the float data as we need quiet heart sounds to shine through

        // cast to HTMLCanvasElement so we can call canvas.getContext
        this.canvasContextXX = this.canvas.getContext('2d');
        this.canvasContextXX.resetTransform();

        // this.canvasForLine = <HTMLCanvasElement> document.getElementById(lineDiv);
        // this.lineContext = this.canvasForLine.getContext("2d");
    }

    drawOnScreen = () => {
        // draw main image
        this.canvasContextXX.imageSmoothingEnabled = false;
        this.canvasContextXX.drawImage(this.wf.offScreenCvs, 0, 0);
        if (this.playing) { requestAnimationFrame(this.drawOnScreen); }
    }

    // This is only max gain adjust and will not interfere with other gain adjustment in filters
    // Min is 0 -- Obviously sound data will be above 0 if not its plain
    // Max is -100.0 -- Onvoiusly this is way too high and impossible to get such high sonds
    doGainAdjust() {

        // look for max/min, min is lowest sound
        let max = -100.0;
        let min = 0;
        for (let i = 0; i < this.floatFreqData.length / 30; i++) {
            if (this.floatFreqData[i] > max) {
                max = this.floatFreqData[i];
            }
            if (this.floatFreqData[i] < min) {
                min = this.floatFreqData[i];
            }
        }
        // we have a desired max DB of -40
        // max is -60, so add 20 onto everyone

        // we have a desired average
        // adjust gain to get there
        const instaGain = this.desiredMaxDB - max;
        this.gain = this.gain * 0.985 + instaGain * 0.015; // at 30 frames/sec time constant is ~2 sec
        // console.log("gain: " + this.gain)
    }

    convertToByteFrequencyData() {
        // // negative numbers, -40 is louder than -100
        const highFrequencyBoost = 12.0; //lung sounds clearer than heart sounds
        let scale = highFrequencyBoost / this.floatFreqData.length; //high frequency boost

        for (let i = 0; i < this.floatFreqData.length; i++) {
            const soundLevel = (this.floatFreqData[i] + this.gain); // loudest soundLevel for a band should be ~0, numbers will go to like -40

            const dynamicRange = 9;  // too high and you only see peaks, too low every thing is noisy
            //let byteVal = 255 + soundLevel * dynamicRange + scale; //original scaling
            const visualGain = 400.0; //sensitivity
            const visualOffset = -10; //eliminate display of soft sounds
            let byteVal = visualGain * Math.pow(10.0, 0.05*soundLevel) * (1.0 + scale * i) + visualOffset;
            // console.log(byteVal);
            // console.log(255 * Math.pow(10, 0.05 * this.floatFreqData[i]));
            if (byteVal > 255) {
                byteVal = 255;
            }
            if (byteVal < 0) {
                byteVal = 0;
            }
            this.frqBuf[i] = byteVal;
        }
    }

    // we are only interested in the bottom 1/30 of frequencies, so up to 24000/30 ie 800 Hz
    getCursorPosition() {
        /**
         * Explantion: https://stackoverflow.com/questions/40315433/analysernodes-getfloatfrequencydata-vs-getfloattimedomaindata
         * More Info: https://stackoverflow.com/questions/24083349/understanding-getbytetimedomaindata-and-getbytefrequencydata-in-web-audio
         * The Float32Array obtained using getFloatTimeDomainData will contain an array
         * of sample values, each value defining the amplitude at the sampled location,
         * usually in the domain of [-1, 1]. Sample locations are uniquely distributed,
         * the obtained data is essentially the equivalent of raw PCM.
         *  */
        this.analyserNode.getFloatTimeDomainData(this.floatTimeData); // negative numbers, -40 is louder than -100

        let sum = 0.0;
        for (let i = 0; i < this.floatTimeData.length / 2; i++) {
            sum += this.floatTimeData[i];
        }
        return sum / this.floatTimeData.length / 2;
    }

    getMaxMinPosition() {
        /**
         * Explantion: https://stackoverflow.com/questions/40315433/analysernodes-getfloatfrequencydata-vs-getfloattimedomaindata
         * More Info: https://stackoverflow.com/questions/24083349/understanding-getbytetimedomaindata-and-getbytefrequencydata-in-web-audio
         * The Float32Array obtained using getFloatTimeDomainData will contain an array
         * of sample values, each value defining the amplitude at the sampled location,
         * usually in the domain of [-1, 1]. Sample locations are uniquely distributed,
         * the obtained data is essentially the equivalent of raw PCM.
         *  */
        this.analyserNode.getFloatTimeDomainData(this.floatTimeData); // negative numbers, -40 is louder than -100

        let max = -1.0;
        let min = 1.0;
        for (let i = 0; i < this.floatTimeData.length / 2; i++) {
            const val = this.floatTimeData[i];
            if (val > max) { max = val; }
            if (val < min) { min = val; }
        }
        // console.log("min, ", min, "max: ", max);
        return [max, min];
    }

    // we are interested in low frequencies
    adjustVerticalScaleByteBuffer() {
        for (let i = this.frqBuf.length; i > 1; i--) {
            const half = i / 2;
            const low = Math.round(half - 1);
            const mid = Math.round(half);
            const high = Math.round(half + 1);

            this.frqBuf[i] = 0.25 * this.frqBuf[low] + 0.5 * this.frqBuf[mid] + 0.25 * this.frqBuf[high];
        }
    }


    beginDisplay() {
        this.wf.start();
        this.playing = true;
        this.drawOnScreen();
    }

    haltDisplay() {
        this.wf.pause();
        this.playing = false;
    }

    stopDisplay() {
        this.wf.stop();
        this.playing = false;
    }

    resumeDisplay() {
        this.wf.resume();
        this.playing = true;
        this.drawOnScreen();
    }

    alterPlayBackSpeed(speed) {
      this.wf.sgSetLineRate(speed);
    }
}

// speed optimization: (Tom notes that the getImageData/putImageData is slow)
// this would be in the Spectrogram-v100.js file
// https://stackoverflow.com/questions/8376534/shift-canvas-contents-to-the-left
// use the ctx.globalCompositeOperation OR the one below that http://jsfiddle.net/6ne3fy3f/
/*
ctx.globalCompositeOperation = "copy";
ctx.drawImage(ctx.canvas,-widthOfMove, 0);
// reset back to normal for subsequent operations.
ctx.globalCompositeOperation = "source-over"
 */


export {
    SpectrogramDrawer,
};


/*=============================================================
  Filename: Spectrogram-1v00.js

  JavaScript graphics functions to draw Spectrograms.

  Date    Description                                       By
  -------|-------------------------------------------------|---
  12Nov18 First beta                                        ARC
  17Nov18 Added offset into data buffer                     ARC
  08May19 this.imageURL URL added
          bugfix: fixed isNaN test
          Changed sgStart, sgStop to start, stop
          Added options object to constructors              ARC
  10May19 Enabled Left to Right as well as Top to Bottom    ARC
  11May19 Added RasterscanSVG                               ARC
  12May19 Added blnkline for horizontal ratser scans        ARC
  13May19 Eliminated unneccessary putImageData              ARC
  14May19 Removed toDataURL, not used drawImage is better
          bugfix: SVG RHC names swapped                     ARC
  02Jun19 bugfix: startOfs not honored in horizontalNewLine ARC
  03Jun19 Flipped the SVG and RHC names for waterfalls      ARC
  04Jun19 Unflip SVG and RHC for horizontal mode            ARC
          Swap "SVG" & "RHC" strings to match fn names      ARC
  05Jun19 bugfix: WaterfallSVG scrolling wrong way          ARC
  10Jun19 bugfix: support lineRate=0 for static display
          bugfix: ipBufPtr must be a ptr to a ptr           ARC
  11Jun19 Make ipBuffers an Array of Arrays, if lineRate=0
          use all buffers else use only ipBuffer[0]         ARC
  13Jun19 Use Waterfall and Rasterscan plus direction
          Use Boolean rater than string compare             ARC
  16Jun19 Use const and let                                 ARC
  20Jun19 Change order of parameters                        ARC
  21Jun19 Add setLineRate method                            ARC
  06Jul19 Released as Rev 1v00                              ARC
 ==============================================================*/

class StethIOSpectrogram {
    opt: Object;
    offScreenCvs: HTMLCanvasElement;
    offScreenCtx: CanvasRenderingContext2D; // offscreen canvas drawing context
    pxPerLine: number;
    lines: number;
    lineRate: number;
    interval: number;
    startOfs: number;
    vertLineBuf: ArrayBuffer;
    vertLineBuf8: Uint8ClampedArray;
    vertLineImgData: ImageData;
    ipBuf8: any;
    clearBuf: ArrayBuffer;
    clearBuf8: Uint8ClampedArray;
    clearImgData: ImageData;
    colMap: Array<Array<number>>;
    nextLine: number;
    timerID: any;
    running: boolean;
    sgTime: number;
    sgStartTime: number;
    demoCvsId: string;
    ipBufAry: Array<Uint8Array>;
    spectogramDrawer: SpectrogramDrawer;
    heartMode: boolean;
    mode: 'HEART' | 'LUNG' = 'HEART';

    constructor(ipBufAry, w, h, options, drawer, heartMode) {
        this.heartMode = heartMode;
        heartMode ? this.mode = 'HEART' : this.mode = 'LUNG';
        this.opt = (typeof options === 'object') ? options : {};   // avoid undeclared object errors
        this.ipBufAry = ipBufAry;
        this.offScreenCtx;
        this.pxPerLine = w || 200;
        this.lines = (h >= 200) ? h : 200;
        this.lineRate = 30;  // or perhap w/25 ?   // requested line rate for dynamic waterfalls
        this.interval = 0;   // msec
        this.startOfs = 0;
        this.spectogramDrawer = drawer;
        this.vertLineBuf = new ArrayBuffer(parseInt(''+this.lines) * 4); // 1 line
        this.vertLineBuf8 = new Uint8ClampedArray(this.vertLineBuf);
        this.vertLineImgData = new ImageData(this.vertLineBuf8, 1, parseInt(''+this.lines));  // 1 vertical line of canvas pixels

        this.ipBuf8 = null;  // map input data to 0..255 unsigned bytes

        this.clearBuf = new ArrayBuffer(parseInt(''+this.pxPerLine) * parseInt(''+this.lines) * 4);  // fills with 0s ie. rgba 0,0,0,0 = transparent
        this.clearBuf8 = new Uint8ClampedArray(this.clearBuf);
        this.buildColourMap();
        // make a full canvas of the color map 0 values
        for (let i = 0; i < this.pxPerLine * this.lines * 4; i += 4) {
            // byte reverse so number aa bb gg rr
            this.clearBuf8[i] = this.colMap[0][0];   // red
            this.clearBuf8[i + 1] = this.colMap[0][1]; // green
            this.clearBuf8[i + 2] = this.colMap[0][2]; // blue
            this.clearBuf8[i + 3] = this.colMap[0][3]; // alpha
        }

        this.clearImgData;
        this.nextLine = 0;
        this.timerID = null;
        this.running = false;
        this.sgTime = 0;
        this.sgStartTime = 0;
        this.demoCvsId = '';

        // ===== set all the options  ================
        for (const prop in this.opt) {
            // check that this is opt's own property, not inherited from prototype
            if (this.opt.hasOwnProperty(prop)) {
                this.setProperty(prop, this.opt[prop]);
            }
        }

    // ===== now make the exposed properties and methods ===============

        this.offScreenCvs = document.createElement('canvas');
        // data written in columns
        this.offScreenCvs.setAttribute('height', this.lines.toString());       // reset canvas pixels width
        this.offScreenCvs.setAttribute('width', this.pxPerLine.toString());  // don't use style for this
        this.clearImgData = new ImageData(this.clearBuf8, parseInt(''+this.pxPerLine), parseInt(''+this.lines));
        this.offScreenCtx = this.offScreenCvs.getContext('2d');        
        this.offScreenCtx.imageSmoothingEnabled = false;
        this.offScreenCtx.strokeStyle = 'rgba(255, 255, 255, 1.0)'; // play with this line for line colour
        this.offScreenCtx.lineWidth = 0.5; // thickness - max 1 only makes sense

        // for diagnostics only
        if (typeof(this.demoCvsId) == 'string' && this.demoCvsId) {
            document.getElementById(this.demoCvsId).appendChild(this.offScreenCvs);
        }
        // initialize the direction and first line position
        this.stop();

        // everything is set
        // if dynamic, wait for the start or newLine methods to be called

    }
    // Matlab Jet ref: stackoverflow.com grayscale-to-red-green-blue-matlab-jet-color-scale
    buildColourMap() {
        let mode = this.mode;
        // Draw sound line if heart mode
        if((!mode && this.heartMode) || mode === 'HEART') {
            // New Heart -- 255 colors + 1 black color added at start
            this.colMap = [
                [0, 0, 0, 255],
                [204, 204, 204, 0],
                [177, 152, 204, 1],
                [171, 143, 204, 3],
                [166, 136, 204, 4],
                [162, 131, 204, 6],
                [159, 127, 204, 7],
                [155, 124, 204, 9],
                [152, 120, 204, 10],
                [148, 118, 204, 12],
                [145, 115, 204, 14],
                [142, 113, 204, 15],
                [139, 111, 204, 17],
                [136, 108, 204, 18],
                [133, 107, 204, 20],
                [130, 105, 204, 21],
                [127, 103, 204, 23],
                [124, 101, 204, 25],
                [121, 100, 204, 26],
                [118, 98, 204, 28],
                [114, 97, 204, 29],
                [111, 96, 204, 31],
                [108, 94, 204, 32],
                [105, 93, 204, 34],
                [102, 92, 204, 36],
                [99, 91, 204, 37],
                [96, 89, 204, 39],
                [93, 88, 204, 40],
                [90, 87, 204, 42],
                [87, 86, 204, 43],
                [85, 86, 204, 45],
                [84, 88, 204, 46],
                [83, 89, 204, 48],
                [82, 90, 204, 49],
                [81, 91, 204, 51],
                [80, 93, 204, 53],
                [79, 94, 204, 54],
                [78, 95, 204, 56],
                [78, 97, 204, 57],
                [77, 98, 204, 59],
                [76, 100, 204, 60],
                [75, 102, 204, 62],
                [74, 103, 204, 63],
                [74, 105, 204, 65],
                [73, 107, 204, 66],
                [72, 108, 204, 68],
                [71, 110, 204, 69],
                [71, 112, 204, 71],
                [70, 114, 204, 72],
                [69, 116, 204, 74],
                [68, 118, 204, 75],
                [68, 120, 204, 77],
                [67, 122, 204, 78],
                [66, 124, 204, 80],
                [66, 126, 204, 81],
                [65, 128, 204, 83],
                [64, 130, 204, 84],
                [64, 132, 204, 86],
                [63, 134, 204, 87],
                [63, 136, 204, 89],
                [62, 139, 204, 90],
                [61, 141, 204, 92],
                [61, 143, 204, 93],
                [60, 145, 204, 95],
                [60, 148, 204, 96],
                [59, 150, 204, 97],
                [59, 152, 204, 99],
                [58, 155, 204, 100],
                [57, 157, 204, 102],
                [57, 160, 204, 103],
                [56, 162, 204, 105],
                [56, 164, 204, 106],
                [55, 167, 204, 108],
                [55, 169, 204, 109],
                [54, 172, 204, 110],
                [54, 174, 204, 112],
                [53, 177, 204, 113],
                [53, 180, 204, 115],
                [52, 182, 204, 116],
                [52, 185, 204, 117],
                [51, 187, 204, 119],
                [51, 190, 204, 120],
                [50, 193, 204, 122],
                [50, 195, 204, 123],
                [49, 198, 204, 124],
                [49, 201, 204, 126],
                [48, 204, 204, 127],
                [48, 204, 201, 128],
                [48, 204, 198, 130],
                [47, 204, 195, 131],
                [47, 204, 192, 132],
                [46, 204, 190, 134],
                [46, 204, 187, 135],
                [45, 204, 184, 136],
                [45, 204, 181, 138],
                [45, 204, 178, 139],
                [44, 204, 175, 140],
                [44, 204, 172, 142],
                [43, 204, 170, 143],
                [43, 204, 167, 144],
                [42, 204, 164, 146],
                [42, 204, 161, 147],
                [42, 204, 158, 148],
                [41, 204, 155, 149],
                [41, 204, 152, 151],
                [40, 204, 149, 152],
                [40, 204, 146, 153],
                [40, 204, 143, 154],
                [39, 204, 140, 156],
                [39, 204, 137, 157],
                [39, 204, 134, 158],
                [38, 204, 131, 159],
                [38, 204, 127, 161],
                [37, 204, 124, 162],
                [37, 204, 121, 163],
                [37, 204, 118, 164],
                [36, 204, 115, 165],
                [36, 204, 112, 167],
                [36, 204, 109, 168],
                [35, 204, 106, 169],
                [35, 204, 102, 170],
                [35, 204, 99, 171],
                [34, 204, 96, 172],
                [34, 204, 93, 174],
                [33, 204, 89, 175],
                [33, 204, 86, 176],
                [33, 204, 83, 177],
                [32, 204, 80, 178],
                [32, 204, 76, 179],
                [32, 204, 73, 180],
                [31, 204, 70, 181],
                [31, 204, 67, 183],
                [31, 204, 63, 184],
                [30, 204, 60, 185],
                [30, 204, 57, 186],
                [30, 204, 53, 187],
                [29, 204, 50, 188],
                [29, 204, 47, 189],
                [29, 204, 43, 190],
                [29, 204, 40, 191],
                [28, 204, 36, 192],
                [28, 204, 33, 193],
                [28, 204, 30, 194],
                [28, 204, 27, 195],
                [31, 204, 27, 196],
                [34, 204, 27, 197],
                [37, 204, 26, 198],
                [40, 204, 26, 199],
                [42, 204, 26, 200],
                [45, 204, 25, 201],
                [48, 204, 25, 202],
                [51, 204, 25, 203],
                [54, 204, 25, 204],
                [57, 204, 24, 205],
                [60, 204, 24, 206],
                [63, 204, 24, 207],
                [66, 204, 23, 208],
                [69, 204, 23, 209],
                [72, 204, 23, 209],
                [75, 204, 23, 210],
                [78, 204, 22, 211],
                [81, 204, 22, 212],
                [84, 204, 22, 213],
                [87, 204, 21, 214],
                [90, 204, 21, 215],
                [93, 204, 21, 215],
                [96, 204, 21, 216],
                [99, 204, 20, 217],
                [102, 204, 20, 218],
                [105, 204, 20, 219],
                [108, 204, 19, 220],
                [111, 204, 19, 220],
                [114, 204, 19, 221],
                [118, 204, 19, 222],
                [121, 204, 18, 223],
                [124, 204, 18, 223],
                [127, 204, 18, 224],
                [130, 204, 18, 225],
                [133, 204, 17, 226],
                [137, 204, 17, 226],
                [140, 204, 17, 227],
                [143, 204, 17, 228],
                [146, 204, 16, 228],
                [149, 204, 16, 229],
                [153, 204, 16, 230],
                [156, 204, 15, 230],
                [159, 204, 15, 231],
                [162, 204, 15, 232],
                [166, 204, 15, 232],
                [169, 204, 14, 233],
                [172, 204, 14, 234],
                [176, 204, 14, 234],
                [179, 204, 14, 235],
                [182, 204, 13, 236],
                [186, 204, 13, 236],
                [189, 204, 13, 237],
                [192, 204, 13, 237],
                [196, 204, 12, 238],
                [199, 204, 12, 238],
                [202, 204, 12, 239],
                [204, 201, 12, 239],
                [204, 198, 12, 240],
                [204, 194, 11, 241],
                [204, 191, 11, 241],
                [204, 188, 11, 242],
                [204, 184, 11, 242],
                [204, 181, 10, 243],
                [204, 177, 10, 243],
                [204, 174, 10, 243],
                [204, 170, 10, 244],
                [204, 167, 9, 244],
                [204, 163, 9, 245],
                [204, 160, 9, 245],
                [204, 157, 9, 246],
                [204, 153, 8, 246],
                [204, 150, 8, 246],
                [204, 146, 8, 247],
                [204, 142, 8, 247],
                [204, 139, 8, 248],
                [204, 135, 7, 248],
                [204, 132, 7, 248],
                [204, 128, 7, 249],
                [204, 125, 7, 249],
                [204, 121, 6, 249],
                [204, 118, 6, 250],
                [204, 114, 6, 250],
                [204, 110, 6, 250],
                [204, 107, 6, 250],
                [204, 103, 5, 251],
                [204, 100, 5, 251],
                [204, 96, 5, 251],
                [204, 92, 5, 251],
                [204, 89, 4, 252],
                [204, 85, 4, 252],
                [204, 81, 4, 252],
                [204, 78, 4, 252],
                [204, 74, 4, 253],
                [204, 70, 3, 253],
                [204, 67, 3, 253],
                [204, 63, 3, 253],
                [204, 59, 3, 253],
                [204, 56, 3, 253],
                [204, 52, 2, 254],
                [204, 48, 2, 254],
                [204, 45, 2, 254],
                [204, 41, 2, 254],
                [204, 37, 2, 254],
                [204, 33, 1, 254],
                [204, 30, 1, 254],
                [204, 26, 1, 254],
                [204, 22, 1, 254],
                [204, 18, 1, 254],
                [204, 15, 0, 254],
                [204, 11, 0, 254],
                [204, 7, 0, 254],
                [204, 3, 0, 254],
                [204, 0, 0, 255]
            ];
        } else {
            // New Lung -- 255 colors + 1 black color added at start
            this.colMap = [
                [0, 0, 0, 255],
                [255, 255, 255, 0],
                [221, 191, 255, 3],
                [214, 179, 255, 6],
                [208, 171, 255, 9],
                [203, 164, 255, 11],
                [198, 159, 254, 14],
                [194, 155, 254, 16],
                [190, 151, 254, 18],
                [186, 147, 254, 21],
                [182, 144, 254, 23],
                [178, 141, 254, 25],
                [174, 138, 254, 27],
                [170, 136, 254, 29],
                [166, 133, 254, 31],
                [162, 131, 254, 33],
                [158, 129, 254, 35],
                [155, 127, 254, 37],
                [151, 125, 254, 39],
                [147, 123, 254, 41],
                [143, 121, 254, 43],
                [139, 120, 254, 45],
                [136, 118, 254, 47],
                [132, 116, 254, 49],
                [128, 115, 254, 51],
                [124, 113, 254, 53],
                [120, 112, 254, 55],
                [116, 110, 254, 57],
                [112, 109, 254, 58],
                [109, 108, 254, 60],
                [106, 108, 254, 62],
                [105, 110, 254, 64],
                [104, 111, 254, 66],
                [103, 113, 254, 67],
                [102, 114, 254, 69],
                [100, 116, 254, 71],
                [99, 118, 254, 73],
                [98, 119, 254, 74],
                [97, 121, 254, 76],
                [96, 123, 254, 78],
                [95, 125, 254, 79],
                [94, 127, 254, 81],
                [93, 129, 254, 83],
                [92, 131, 254, 84],
                [91, 133, 254, 86],
                [90, 136, 254, 88],
                [89, 138, 254, 89],
                [88, 140, 254, 91],
                [87, 142, 254, 92],
                [87, 145, 254, 94],
                [86, 147, 254, 96],
                [85, 150, 254, 97],
                [84, 152, 254, 99],
                [83, 155, 254, 100],
                [82, 157, 254, 102],
                [81, 160, 254, 103],
                [81, 162, 254, 105],
                [80, 165, 254, 107],
                [79, 168, 254, 108],
                [78, 170, 254, 110],
                [78, 173, 254, 111],
                [77, 176, 254, 113],
                [76, 179, 254, 114],
                [75, 182, 254, 115],
                [75, 185, 254, 117],
                [74, 187, 254, 118],
                [73, 190, 254, 120],
                [73, 193, 254, 121],
                [72, 196, 254, 123],
                [71, 199, 254, 124],
                [70, 202, 254, 126],
                [70, 205, 254, 127],
                [69, 208, 254, 128],
                [69, 212, 254, 130],
                [68, 215, 254, 131],
                [67, 218, 254, 133],
                [67, 221, 254, 134],
                [66, 224, 254, 135],
                [65, 227, 254, 137],
                [65, 231, 254, 138],
                [64, 234, 254, 139],
                [64, 237, 254, 141],
                [63, 240, 254, 142],
                [62, 244, 254, 143],
                [62, 247, 254, 145],
                [61, 250, 254, 146],
                [61, 254, 254, 147],
                [60, 254, 250, 148],
                [59, 254, 247, 150],
                [59, 254, 243, 151],
                [58, 254, 240, 152],
                [58, 254, 236, 153],
                [57, 253, 233, 155],
                [57, 253, 229, 156],
                [56, 253, 226, 157],
                [56, 253, 222, 158],
                [55, 253, 218, 160],
                [54, 253, 215, 161],
                [54, 253, 211, 162],
                [53, 253, 207, 163],
                [53, 253, 204, 164],
                [52, 253, 200, 165],
                [52, 253, 196, 167],
                [51, 253, 192, 168],
                [51, 253, 189, 169],
                [50, 253, 185, 170],
                [50, 253, 181, 171],
                [49, 253, 177, 172],
                [49, 253, 173, 173],
                [48, 252, 170, 175],
                [48, 252, 166, 176],
                [47, 252, 162, 177],
                [47, 252, 158, 178],
                [46, 252, 154, 179],
                [46, 252, 150, 180],
                [46, 252, 146, 181],
                [45, 252, 142, 182],
                [45, 252, 138, 183],
                [44, 252, 134, 184],
                [44, 252, 131, 185],
                [43, 251, 127, 186],
                [43, 251, 123, 187],
                [42, 251, 119, 188],
                [42, 251, 114, 189],
                [41, 251, 110, 190],
                [41, 251, 106, 191],
                [41, 251, 102, 192],
                [40, 251, 98, 193],
                [40, 251, 94, 194],
                [39, 250, 90, 195],
                [39, 250, 86, 196],
                [38, 250, 82, 197],
                [38, 250, 78, 198],
                [38, 250, 74, 199],
                [37, 250, 70, 200],
                [37, 250, 65, 201],
                [36, 249, 61, 202],
                [36, 249, 57, 202],
                [35, 249, 53, 203],
                [35, 249, 49, 204],
                [35, 249, 45, 205],
                [34, 249, 41, 206],
                [34, 249, 36, 207],
                [35, 248, 33, 208],
                [38, 248, 33, 208],
                [41, 248, 33, 209],
                [45, 248, 32, 210],
                [48, 248, 32, 211],
                [52, 247, 31, 212],
                [55, 247, 31, 213],
                [59, 247, 31, 213],
                [62, 247, 30, 214],
                [66, 247, 30, 215],
                [69, 246, 29, 216],
                [73, 246, 29, 216],
                [76, 246, 29, 217],
                [79, 246, 28, 218],
                [83, 246, 28, 219],
                [86, 245, 28, 219],
                [90, 245, 27, 220],
                [94, 245, 27, 221],
                [97, 245, 26, 222],
                [101, 244, 26, 222],
                [104, 244, 26, 223],
                [108, 244, 25, 224],
                [111, 244, 25, 224],
                [115, 243, 25, 225],
                [118, 243, 24, 226],
                [122, 243, 24, 226],
                [125, 242, 24, 227],
                [129, 242, 23, 228],
                [132, 242, 23, 228],
                [136, 242, 23, 229],
                [139, 241, 22, 229],
                [143, 241, 22, 230],
                [147, 241, 21, 231],
                [150, 240, 21, 231],
                [154, 240, 21, 232],
                [157, 240, 20, 232],
                [161, 239, 20, 233],
                [164, 239, 20, 234],
                [168, 239, 19, 234],
                [171, 238, 19, 235],
                [175, 238, 19, 235],
                [178, 238, 18, 236],
                [182, 237, 18, 236],
                [185, 237, 18, 237],
                [189, 236, 17, 237],
                [192, 236, 17, 238],
                [196, 236, 17, 238],
                [199, 235, 17, 239],
                [203, 235, 16, 239],
                [206, 234, 16, 240],
                [210, 234, 16, 240],
                [213, 234, 15, 241],
                [216, 233, 15, 241],
                [220, 233, 15, 242],
                [223, 232, 14, 242],
                [227, 232, 14, 242],
                [230, 231, 14, 243],
                [231, 228, 13, 243],
                [230, 224, 13, 244],
                [230, 220, 13, 244],
                [229, 215, 13, 244],
                [229, 211, 12, 245],
                [228, 207, 12, 245],
                [228, 202, 12, 246],
                [227, 198, 11, 246],
                [227, 194, 11, 246],
                [226, 190, 11, 247],
                [226, 185, 10, 247],
                [225, 181, 10, 247],
                [225, 177, 10, 248],
                [224, 172, 10, 248],
                [223, 168, 9, 248],
                [223, 164, 9, 248],
                [222, 159, 9, 249],
                [222, 155, 9, 249],
                [221, 151, 8, 249],
                [220, 147, 8, 250],
                [220, 142, 8, 250],
                [219, 138, 7, 250],
                [219, 134, 7, 250],
                [218, 130, 7, 251],
                [217, 126, 7, 251],
                [217, 121, 6, 251],
                [216, 117, 6, 251],
                [215, 113, 6, 252],
                [214, 109, 6, 252],
                [214, 105, 5, 252],
                [213, 101, 5, 252],
                [212, 96, 5, 252],
                [212, 92, 5, 252],
                [211, 88, 4, 253],
                [210, 84, 4, 253],
                [209, 80, 4, 253],
                [209, 76, 4, 253],
                [208, 72, 3, 253],
                [207, 68, 3, 253],
                [206, 64, 3, 253],
                [205, 60, 3, 254],
                [204, 56, 3, 254],
                [204, 52, 2, 254],
                [203, 48, 2, 254],
                [202, 44, 2, 254],
                [201, 40, 2, 254],
                [200, 37, 1, 254],
                [199, 33, 1, 254],
                [198, 29, 1, 254],
                [197, 25, 1, 254],
                [197, 21, 1, 254],
                [196, 18, 0, 254],
                [195, 14, 0, 254],
                [194, 10, 0, 254],
                [193, 7, 0, 254],
                [192, 3, 0, 254],
                [191, 0, 0, 255]
            ];
        }
        // OLD - 221 colors
        // this.colMap = [
        //     [0, 0, 0, 255], [0, 0, 131, 255], [0, 0, 135, 255], [0, 0, 139, 255],
        //     [0, 0, 143, 255], [0, 0, 147, 255], [0, 0, 151, 255], [0, 0, 155, 255],
        //     [0, 0, 159, 255], [0, 0, 163, 255], [0, 0, 167, 255], [0, 0, 171, 255],
        //     [0, 0, 175, 255], [0, 0, 179, 255], [0, 0, 183, 255], [0, 0, 187, 255],
        //     [0, 0, 191, 255], [0, 0, 195, 255], [0, 0, 199, 255], [0, 0, 203, 255],
        //     [0, 0, 207, 255], [0, 0, 211, 255], [0, 0, 215, 255], [0, 0, 219, 255],
        //     [0, 0, 223, 255], [0, 0, 227, 255], [0, 0, 231, 255], [0, 0, 235, 255],
        //     [0, 0, 239, 255], [0, 0, 243, 255], [0, 0, 247, 255], [0, 0, 251, 255],
        //     [0, 0, 255, 255], [0, 4, 255, 255], [0, 8, 255, 255], [0, 12, 255, 255],
        //     [0, 16, 255, 255], [0, 20, 255, 255], [0, 24, 255, 255], [0, 28, 255, 255],
        //     [0, 32, 255, 255], [0, 36, 255, 255], [0, 40, 255, 255], [0, 44, 255, 255],
        //     [0, 48, 255, 255], [0, 52, 255, 255], [0, 56, 255, 255], [0, 60, 255, 255],
        //     [0, 64, 255, 255], [0, 68, 255, 255], [0, 72, 255, 255], [0, 76, 255, 255],
        //     [0, 80, 255, 255], [0, 84, 255, 255], [0, 88, 255, 255], [0, 92, 255, 255],
        //     [0, 96, 255, 255], [0, 100, 255, 255], [0, 104, 255, 255], [0, 108, 255, 255],
        //     [0, 112, 255, 255], [0, 116, 255, 255], [0, 120, 255, 255], [0, 124, 255, 255],
        //     [0, 128, 255, 255], [0, 131, 255, 255], [0, 135, 255, 255], [0, 139, 255, 255],
        //     [0, 143, 255, 255], [0, 147, 255, 255], [0, 151, 255, 255], [0, 155, 255, 255],
        //     [0, 159, 255, 255], [0, 163, 255, 255], [0, 167, 255, 255], [0, 171, 255, 255],
        //     [0, 175, 255, 255], [0, 179, 255, 255], [0, 183, 255, 255], [0, 187, 255, 255],
        //     [0, 191, 255, 255], [0, 195, 255, 255], [0, 199, 255, 255], [0, 203, 255, 255],
        //     [0, 207, 255, 255], [0, 211, 255, 255], [0, 215, 255, 255], [0, 219, 255, 255],
        //     [0, 223, 255, 255], [0, 227, 255, 255], [0, 231, 255, 255], [0, 235, 255, 255],
        //     [0, 239, 255, 255], [0, 243, 255, 255], [0, 247, 255, 255], [0, 251, 255, 255],
        //     [0, 255, 255, 255], [4, 255, 251, 255], [8, 255, 247, 255], [12, 255, 243, 255],
        //     [16, 255, 239, 255], [20, 255, 235, 255], [24, 255, 231, 255], [28, 255, 227, 255],
        //     [32, 255, 223, 255], [36, 255, 219, 255], [40, 255, 215, 255], [44, 255, 211, 255],
        //     [48, 255, 207, 255], [52, 255, 203, 255], [56, 255, 199, 255], [60, 255, 195, 255],
        //     [64, 255, 191, 255], [68, 255, 187, 255], [72, 255, 183, 255], [76, 255, 179, 255],
        //     [80, 255, 175, 255], [84, 255, 171, 255], [88, 255, 167, 255], [92, 255, 163, 255],
        //     [96, 255, 159, 255], [100, 255, 155, 255], [104, 255, 151, 255], [108, 255, 147, 255],
        //     [112, 255, 143, 255], [116, 255, 139, 255], [120, 255, 135, 255], [124, 255, 131, 255],
        //     [128, 255, 128, 255], [131, 255, 124, 255], [135, 255, 120, 255], [139, 255, 116, 255],
        //     [143, 255, 112, 255], [147, 255, 108, 255], [151, 255, 104, 255], [155, 255, 100, 255],
        //     [159, 255, 96, 255], [163, 255, 92, 255], [167, 255, 88, 255], [171, 255, 84, 255],
        //     [175, 255, 80, 255], [179, 255, 76, 255], [183, 255, 72, 255], [187, 255, 68, 255],
        //     [191, 255, 64, 255], [195, 255, 60, 255], [199, 255, 56, 255], [203, 255, 52, 255],
        //     [207, 255, 48, 255], [211, 255, 44, 255], [215, 255, 40, 255], [219, 255, 36, 255],
        //     [223, 255, 32, 255], [227, 255, 28, 255], [231, 255, 24, 255], [235, 255, 20, 255],
        //     [239, 255, 16, 255], [243, 255, 12, 255], [247, 255, 8, 255], [251, 255, 4, 255],
        //     [255, 255, 0, 255], [255, 251, 0, 255], [255, 247, 0, 255], [255, 243, 0, 255],
        //     [255, 239, 0, 255], [255, 235, 0, 255], [255, 231, 0, 255], [255, 227, 0, 255],
        //     [255, 223, 0, 255], [255, 219, 0, 255], [255, 215, 0, 255], [255, 211, 0, 255],
        //     [255, 207, 0, 255], [255, 203, 0, 255], [255, 199, 0, 255], [255, 195, 0, 255],
        //     [255, 191, 0, 255], [255, 187, 0, 255], [255, 183, 0, 255], [255, 179, 0, 255],
        //     [255, 175, 0, 255], [255, 171, 0, 255], [255, 167, 0, 255], [255, 163, 0, 255],
        //     [255, 159, 0, 255], [255, 155, 0, 255], [255, 151, 0, 255], [255, 147, 0, 255],
        //     [255, 143, 0, 255], [255, 139, 0, 255], [255, 135, 0, 255], [255, 131, 0, 255],
        //     [255, 128, 0, 255], [255, 124, 0, 255], [255, 120, 0, 255], [255, 116, 0, 255],
        //     [255, 112, 0, 255], [255, 108, 0, 255], [255, 104, 0, 255], [255, 100, 0, 255],
        //     [255, 96, 0, 255], [255, 92, 0, 255], [255, 88, 0, 255], [255, 84, 0, 255],
        //     [255, 80, 0, 255], [255, 76, 0, 255], [255, 72, 0, 255], [255, 68, 0, 255],
        //     [255, 64, 0, 255], [255, 60, 0, 255], [255, 56, 0, 255], [255, 52, 0, 255],
        //     [255, 48, 0, 255], [255, 44, 0, 255], [255, 40, 0, 255], [255, 36, 0, 255],
        //     [255, 32, 0, 255], [255, 28, 0, 255], [255, 24, 0, 255], [255, 20, 0, 255],
        //     [255, 16, 0, 255], [255, 12, 0, 255], [255, 8, 0, 255], [255, 4, 0, 255],
        //     [0, 0, 0, 0]
        // ];
    }
    incrLine() {
        this.nextLine++;
        if (this.nextLine >= this.lines) {
            this.nextLine = 0;
        }
    }

    updateWaterfall() {
        // grab latest line of data, write it to off screen buffer, inc 'nextLine'        

        const minMax = this.getDataOrganized();
        this.horizontalNewLine();
        // Get processing mode from localstorage
        let mode = this.mode;
        // Draw sound line if heart mode
        if((!mode && this.heartMode) || mode === 'HEART') {
            this.drawSoundLine(minMax);
        }        
        // loop to write data data at the desired rate, data is being updated asynchronously
        // ref for accurate timeout: http://www.sitepoint.com/creating-accurate-timers-in-javascript        
        if (this.running) {
            this.sgTime += this.interval;
            const sgDiff = (Date.now() - this.sgStartTime) - this.sgTime;
            const self = this;
            this.timerID = setTimeout(function () {
                self.updateWaterfall();
            }, this.interval - sgDiff);
        }
    }

    getDataOrganized() {
        this.spectogramDrawer.analyserNode.getFloatFrequencyData(this.spectogramDrawer.floatFreqData); // negative numbers, -40 is louder than -100
        // console.log(this.spectogramDrawer.floatFreqData);
        // add in the audio line
        const minMax = this.spectogramDrawer.getMaxMinPosition();
        this.spectogramDrawer.doGainAdjust();
        this.spectogramDrawer.convertToByteFrequencyData();
        this.spectogramDrawer.adjustVerticalScaleByteBuffer();
        return minMax;
    }

    /* Adding the audio lines
    *  @params minMax = Array of two values 0 - max and 1 - min
    */
    drawSoundLine(minMax) {
        // we want the line above the heat map  mostly
        let bufferHeight = this.spectogramDrawer.targetHeight / 200; // to provide a buffer value for dynamic canvas height
        const range = this.spectogramDrawer.targetWidth / 3; //this.spectogramDrawer.targetWidth * 2
        const offset = this.spectogramDrawer.targetHeight / (3 * bufferHeight); // Divide by 4 because the line graph need to start at 1/4th of the screen
        let start = offset - minMax[0] * range;
        let end = offset - minMax[1] * range;
        if (end - start < 1.0) { // draw single pixel if there is no sound
            end = start + 1;
        }
        // TODO: Dose work but its more like adjusting after wrong frequency calibaration. Then best to calibarate before itself.
        // Adding variation to the peaks
        // if(this.prevStart == start) {
        //     start += 10;
        // } else {
        //     this.prevStart = start;
        // }
        // if(this.prevEnd == end) {
        //     end -= 10;
        // } else {
        //     this.prevEnd = end;
        // }

        // draw new line segment
        const saved = this.offScreenCtx.globalCompositeOperation;
        this.offScreenCtx.globalCompositeOperation = 'source-over';
        this.offScreenCtx.beginPath();
        this.offScreenCtx.translate(0.5, 0);
        this.offScreenCtx.moveTo(1, start); // Change to 2 if using in RPM
        this.offScreenCtx.lineTo(1, end); // Change to 2 if using in RPM
        this.offScreenCtx.stroke();
        this.offScreenCtx.globalCompositeOperation = saved;
        this.offScreenCtx.resetTransform();
    }

    sgSetLineRate(newRate) {
        if (isNaN(newRate) || newRate < 0) {
            console.error('invalid line rate [0 <= lineRate]');
            // don't change the lineRate;
        } else if (newRate === 0) {
            this.lineRate = 0;
        } else {
            this.lineRate = newRate;
            this.interval = 1000 / this.lineRate;  // msec
        }
    }

    setProperty(propertyName, value) {
        if ((typeof propertyName !== 'string') || (value === undefined)) {
            return;
        }
        switch (propertyName.toLowerCase()) {
            case 'linerate':
                this.sgSetLineRate(value);  // setLine does checks for number etc
                break;
            case 'startbin':
                if (!isNaN(value) && value > 0) {
                    this.startOfs = value;
                }
                break;
            case 'onscreenparentid':
                if (typeof value === 'string' && document.getElementById(value)) {
                    this.demoCvsId = value;
                }
                break;
            case 'colormap':
                if (Array.isArray(value) && Array.isArray(value[0]) && value[0].length == 4) {
                    this.colMap = value; // value must be an array of 4 element arrays to get here
                    if (this.colMap.length < 256) {
                        for (let i = this.colMap.length; i < 256; i++) {
                            this.colMap[i] = this.colMap[this.colMap.length - 1];
                        }
                    }
                }
                break;
            default:
                break;
        }
    }

    /* Creates new lines so the canvas can proceed (only heat map) */
    horizontalNewLine() {
        let tmpImgData, ipBuf8;

        if (this.ipBufAry[0].constructor !== Uint8Array) {
            ipBuf8 = Uint8ClampedArray.from(this.ipBufAry[0]); // clamp input values to 0..255 range
        } else {
            ipBuf8 = this.ipBufAry[0];  // conversion already done
        }

        this.offScreenCtx.globalCompositeOperation = 'copy';
        this.offScreenCtx.imageSmoothingEnabled = false;
        this.offScreenCtx.drawImage(this.offScreenCtx.canvas, 1, 0); // Change the 2,0 ro change the direction of graph flow
        this.offScreenCtx.globalCompositeOperation = 'source-over';
        let bufferline = (this.lines - 152); // The canvas length -150 provided the proper wave graph since the 2 pixel was added in html it is also added to the subtract value
        for (let offset = 0, sigVal, rgba, opIdx, ipIdx = 0; ipIdx < this.lines; ipIdx++) {

            sigVal = ipBuf8[ipIdx - (bufferline)] || 0;    // if input line too short add zeros
            rgba = this.colMap[sigVal];  // array of rgba values
            // console.log("Signal values: ", sigVal);
            // console.log("rgba values: ", rgba);
            // Add color map
            this.addReplaceColorMap(rgba, ipIdx, offset);
            // Add color to next line as well to increase the color map -- Not working and breaks the graph
            // if(sigVal !== 0) {
            //     offset++;
            //     // Add color map
            //     this.addReplaceColorMap(rgba, ipIdx, offset);
            // }
        }
        this.offScreenCtx.putImageData(this.vertLineImgData, 1, this.nextLine);
    }

    addReplaceColorMap(rgba, ipIdx, offset) {
        // byte reverse so number aa bb gg rr
        // opIdx = this.lines*4 - 4*ipIdx;
        let opIdx = (4 * ((this.lines - 1) - ipIdx)) + offset;
        this.vertLineBuf8[opIdx] = rgba[0];   // red
        this.vertLineBuf8[opIdx + 1] = rgba[1]; // green
        this.vertLineBuf8[opIdx + 2] = rgba[2]; // blue
        // If lung mode then resuce the alpha value (Alpha represent the tranparency of the color)
        let mode = this.mode;
        if(mode === 'LUNG') {
            this.vertLineBuf8[opIdx + 3] = 85; // alpha
        } else {
            this.vertLineBuf8[opIdx + 3] = rgba[3]; // alpha
        }
        // if(mode === 'HEART' && sigVal < 100) {
        //     this.vertLineBuf8[opIdx] = this.colMap[0][0];   // red
        //     this.vertLineBuf8[opIdx + 1] = this.colMap[0][1]; // green
        //     this.vertLineBuf8[opIdx + 2] = this.colMap[0][2]; // blue
        //     this.vertLineBuf8[opIdx + 3] = this.colMap[0][3]; // alpha
        // }
        // TODO: below line will check if the range of lung sounds color map
        // if(this.vertLineBuf8[opIdx] > 0 && this.vertLineBuf8[opIdx+1] > 0 && this.vertLineBuf8[opIdx+2] > 0 && this.vertLineBuf8[opIdx+3] > 0) {
        //     console.log("Color map not empty");
        // }
    }

    clear() {
        this.offScreenCtx.putImageData(this.clearImgData, 0, 0);
        console.log(this.clearImgData);
        this.colMap = [];
    }

    start() {
        this.sgStartTime = Date.now();
        this.sgTime = 0;
        this.running = true;
        this.updateWaterfall();  // start the update loop
    }

    resume() {
        console.log(this.sgTime);
        this.running = true;
        this.updateWaterfall();
    }

    pause() {
        this.running = false;
        if (this.timerID) {
            clearTimeout(this.timerID);
        }
        this.nextLine = 0;

    }
    stop() {
        this.running = false;
        if (this.timerID) {
            clearTimeout(this.timerID);
        }
        // reset where the next line is to be written
        this.nextLine = 0;
    }

}
