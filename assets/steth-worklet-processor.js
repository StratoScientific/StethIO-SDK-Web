
// This does not let one record data while paused, which is a logical possibility
const kRecordMic = 'kRecordMic';        // recording flows live data back
const kRecordRemote = 'kRecordRemote';  // record remote data
const kPlayback = 'kPlayback';          // play what we have in a loop
const kPause = 'kPause';                // also pause recording data, if that is happening

var blocksIn = 0;
class StethWorkletProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this._outputRingBuffer = new RingBuffer(500000, 1);
        this.port.onmessage = this.handleMessage_.bind(this);
        this.outBuffer = new Float32Array(512); // 128 is locked in as in buffer size, so we wait until this is full
        this.outBufferSamples = 0;
        this.usingMicrophone = true;
        this.state = kPause;
        this.last_val = 0;
        this.heartMode = true;
    }

    // WorletSystem sends a message with the data every time it gets a Float32Array buffer of samples ready.
    handleMessage_(event) {
        if (event.data.type == 'samples') {
            this.state = kRecordRemote;
            blocksIn += 1;
            this._outputRingBuffer.push([event.data.samples], event.data.heartMode, event.data.gain);
        } else if (event.data.type == 'setSamples') {
            console.log('[Processor setSamples :Received] num samples: ' + event.data.samples.length);
            this.state = kPlayback;
            this.setSamples(event.data.samples, event.data.heartMode, event.data.gain);
        } else if (event.data.type == 'setState') {
            console.log('[Processor setSamples :Received] state: ' + event.data.state);
            this.state = event.data.state;
        } else if(event.data.type === 'live') {
            console.log('Outputs: ',event.data.outputs[0][0]);
            // play sounds we have in the buffer:
            const outputBuffer = event.data.outputs[0];
            const outputChannel = outputBuffer[0];

            // if we are looping over the current sound in the buffer, then we just ignore the writePtr.
            var ignoreWritePtr = false;
            if (this.state == kPlayback){
                ignoreWritePtr = true;
            }
            // pull frame from our buffer
            this._outputRingBuffer.play([outputChannel], ignoreWritePtr);
            if (outputBuffer.length > 1) {
                for (let counter = 0; counter < outputBuffer[1].length; counter++) {
                    outputBuffer[1][counter] = outputChannel[counter];
                }
            }
        } else {
            console.log('[Processor:Received] other message: ' + event.data.type);
        }
    }

    // sets the ring buffer to be all the passed samples. Also we ignore microphone.
    setSamples(allSamples, heartMode, gain) { // allSamples: Float32Array
        this._outputRingBuffer = new RingBuffer(allSamples.length, 1);
        this._outputRingBuffer.push([allSamples], heartMode, gain, true);
        this.heartMode = heartMode;
        // DEBUG: If its martins audio run audio filter for sample
            // if(allSamples[0] == -0.000518798828125) {
            //     // 600hz is for heart and lung range frequency
            //     const inpRes = this.lowPassFilter(allSamples, 600, 44100, this.last_val);
            //     this._outputRingBuffer.push([inpRes.samples]);
            // } else {
            //     this._outputRingBuffer.push([allSamples]);
            // }
    }

    // we are always called with 128 samples. This is hardwired, which is fine.
    process(inputs, outputs, parameters) {
        if (this.state == "kPause") {
            return true; // don't do anything while paused
        }

        // console.log(inputs);
        // console.log(outputs);
        // console.log(parameters);


        // const gProcessingSampleRate = 44100.0;
        // const input0 = inputs[0];
        const output0 = outputs[0];
        // const inputChannel = input0[0];
        // const outputChannel = output0[0];

        // Lung noice gate filtering
            // const alpha = 1.0 / (0.01 * gProcessingSampleRate);
            // const HFthresholdLevel = 0.002;
            // const HFMaxGainReduction = 0.05;
            // const highpassCutoff = 5000.0;
            
            // //First-order high-pass filter
            // var w = Math.tan(Math.PI * highpassCutoff / gProcessingSampleRate);
            // var a0 = 1.0 / (1.0 + w);
            // var b1 = (1.0 - w) / (1.0 + w);
            // var sample;
            // var reduceGain;
            // var filtered = 0.0;
            
            // for(var k = 0; k < inputChannel.length; ++k) {
            //     sample = inputChannel[k];            
            //     filtered = a0 * (sample - this.z1) + b1 * this.p1;
            //     this.z1 = sample;
            //     this.p1 = filtered;
            //     this.HF_Level = alpha * Math.abs(filtered) + (1.0 - alpha) * this.HF_Level;

            //     var absLevel = Math.abs(this.HF_Level);
            //     if(absLevel > HFthresholdLevel) {
            //         //drop lung gain in greater proportion to the HF noise
            //         reduceGain = (HFthresholdLevel / absLevel);
            //         reduceGain *= reduceGain;
            //         if(reduceGain < HFMaxGainReduction)
            //             reduceGain = HFMaxGainReduction;   
            //     } else {
            //         reduceGain = 1.0;
            //     }
            
            //     outputChannel[k] = sample * reduceGain;
            // }

        // Auto gain level adjustment
            // var lungGainTarget;
            // const LUNG_GAIN_HISTORICAL_TIME_CONSTANT = 5.0; //how we calculate average
            // const LUNG_GAIN_FAST_TIME_CONSTANT = 0.02; //how quickly we adjust level
            // const alphaMeasure = 1.0 / (LUNG_GAIN_HISTORICAL_TIME_CONSTANT * gProcessingSampleRate);
            // const alphaAdjust = 1.0 / (LUNG_GAIN_FAST_TIME_CONSTANT * gProcessingSampleRate);
            // if(typeof inputChannel === 'undefined') {
            //     return true;
            // }
            
            // for(var k = 0; k < inputChannel.length; ++k) {
            //     this.lungHistoricalAverage = alphaMeasure * Math.abs(inputChannel[k]) + (1.0 - alphaMeasure) * this.lungHistoricalAverage;
            // }

            // lungGainTarget = this.lungLevelDesired / this.lungHistoricalAverage;

            // if (lungGainTarget > 15.0) {
            //     lungGainTarget = 15.0;
            // }
            // if (lungGainTarget < 0.5) {
            //     lungGainTarget = 0.5;
            // }
                    
            // for(var k = 0; k < inputChannel.length; ++k) {
            //     this.sampleGain += alphaAdjust * (lungGainTarget - this.sampleGain);
            //     outputChannel[k] = inputChannel[k] * this.sampleGain;
            // }

            // console.log("Processing happening !!");

        // const inputBuffer = inputs[0];
        // const inputChannel = inputBuffer[0];
        // let inpRes;

        // Apply latest lung filters
        if(!this.heartMode) {
            const gProcessingSampleRate = 16000;
            const LUNG_GAIN_HISTORICAL_TIME_CONSTANT = 5.0; //how we calculate average
            const LUNG_GAIN_FAST_TIME_CONSTANT = 0.02; //how quickly we adjust level
            
            const alphaMeasure = 1.0 / (LUNG_GAIN_HISTORICAL_TIME_CONSTANT * gProcessingSampleRate);
            const alphaAdjust = 1.0 / (LUNG_GAIN_FAST_TIME_CONSTANT * gProcessingSampleRate);
            
            var lungGainTarget; 

            const input0 = inputs[0];
            const output0 = outputs[0];
            const inputChannel = input0[0];
            const outputChannel = output0[0];
            
            if(typeof inputChannel === 'undefined') {
                return true;
            }
            
            for(var k = 0; k < inputChannel.length; ++k) {
                this.lungHistoricalAverage = alphaMeasure * Math.abs(inputChannel[k]) + (1.0 - alphaMeasure) * this.lungHistoricalAverage;
            }
            
            lungGainTarget = this.lungLevelDesired / this.lungHistoricalAverage;
            
            if (lungGainTarget > 15.0) {
                lungGainTarget = 15.0;
            }
                
            if (lungGainTarget < 0.5) {
                lungGainTarget = 0.5;
            }
                    
            for(var k = 0; k < inputChannel.length; ++k) {
                this.sampleGain += alphaAdjust * (lungGainTarget - this.sampleGain);
                outputChannel[k] = inputChannel[k] * this.sampleGain;
            }
        }

        // If its live recording input
        if (this.state == kRecordMic) {
            const inputBuffer = inputs[0];
            // Low pass filter logic  --  For input 
                // let pasFilterSamples = [...inputChannel];
                // // 600hz is for heart and lung range frequency
                // inpRes = this.lowPassFilter(pasFilterSamples, 600, 44100, this.last_val);
                // this.last_val = inpRes.last_val;
                // // add input, which will be microphone, to the output
                // this._outputRingBuffer.push([inpRes.samples]);
            const inputChannel = inputBuffer[0];
            this._outputRingBuffer.push([inputChannel])
        } else {
            // we are not adding data here. it comes in via messages handled with handleMessage()
        }

        //console.log('Called process in the thread');
        // If we wanted to have a web based stethoscope, we would send data obtained here to the remote endpoint.
        // There may be API we can call from the the Chrome AudioWorkletProcessor to get the latest audio as well.
        // this.port.postMessage({ type: 'samples', samples: inputChannel });

        // console.log(outputs[0][0]);
        /* this.port.postMessage({
            type: 'live', outputs: outputs
        }); */

        // if we are looping over the current sound in the buffer, then we just ignore the writePtr.
        var ignoreWritePtr = false;
        if (this.state == kPlayback){
            ignoreWritePtr = true;
        }
        // pull frame from our buffer
        const outputBuffer = outputs[0];
        const outputChannel = outputBuffer[0];
        this._outputRingBuffer.play([outputChannel], ignoreWritePtr);
        if (output0.length > 1) {
            for (let counter = 0; counter < output0[1].length; counter++) {
                output0[1][counter] = outputChannel[counter];
            }
        }

        // debug - just connect incoming to outgoing.
        // for (let i = 0; i < inputChannel.length; i++) {
        //    outputChannel[i] = inputChannel[i];
        // }

        return true;
    }

    lowPassFilter(samples, cutoff, sampleRate, last_val) {
        // console.log('Enter samples: ', samples);
        let rc = 1.0 / (cutoff * 2 * Math.PI);
        let dt = 1.0 / sampleRate;
        let alpha = dt / (rc + dt/2);
        /* let last_val = [];
        let offset;
        for (let i=0; i<numChannels; i++) {
            last_val[i] = samples[i];
        } */
        for (let i=0; i<samples.length; i++) {
            //for (let j=0; j< numChannels; j++) {
                //offset = (i * numChannels) + j;
                last_val += (alpha * (samples[i] - last_val));
                samples[i] = last_val;
            //}
        }
        // console.log('Processed samples: ', samples);
        return {samples, last_val};
    }

}

registerProcessor('socket-worklet', StethWorkletProcessor);


/**
 *
 * Tom wrote to use any buffer size, etc.
 * @class
 */
class RingBuffer {
    /**
     * @constructor
     * @param  {number} length Buffer length in frames.
     * @param  {number} channelCount Buffer channel count.
     */
    constructor(length, channelCount) {
        // these DO NOT Wrap
        //(well I wrap them after hours so I don't run into an 11.6 hour max, so readIndex and _writeIndex can 'only' be a maximum of a ~5 hours apart)
        this._readIndex = 0.0;
        this._writeIndex = 0;

        this._channelCount = channelCount;
        this._length = length;
        this._channelData = [];
        for (let i = 0; i < this._channelCount; ++i) {
            this._channelData[i] = new Float32Array(length);
        }
        this.heartFilters = {};
        this.lungFilters = {};
        this.runBiquad = new BiquadNode();
        this.heart_currentGain;
        this.lung_historical_average;
        // Set up filters
        this.setUpHeartFilter();
        this.setUpLungFilter();
    }

    /**
     * Getter for Available frames in buffer.
     *
     * @return {number} Available frames in buffer.
     */
    get framesAvailable() {
        return this._writeIndex - this._readIndex;
    }

    /**
     * Push a sequence of Float32Arrays to buffer.
     *
     * @param  {array} arraySequence A sequence of Float32Arrays.
     * @param  {boolean} heartMode A boolean to check if its heart mode. If false its lung mode
     */
    push(arraySequence, heartMode = true, gain, applyOnlyGain = false) {
        // The channel count of arraySequence and the length of each channel must
        // match with this buffer obejct.
        // call the filter
        // if(applyOnlyGain){
        //     arraySequence[0] = this.gainFilter(arraySequence[0], gain);
        // } else
        if(heartMode) {
            arraySequence[0] = this.heartFilter(arraySequence[0], gain);
        } else {
            arraySequence[0] = this.lungFilter(arraySequence[0], gain);
        }
        // Transfer data from the |arraySequence| storage to the internal buffer.
        // Source length is always 960
        let sourceLength = arraySequence[0].length;
        for (let i = 0; i < sourceLength; ++i) {
            this._writeIndex++;
            let actualIndex = this._writeIndex % this._length;
            for (let channel = 0; channel < this._channelCount; ++channel) {
                this._channelData[channel][actualIndex] = arraySequence[channel][i];
            }
        }

        // if our _writeIndex is greater than a billion, reset. Tested a bit
        // JS uses 32 bit integers for the % operator as far as I know, even in 64 bit world (JS can't do 64 bit % operator as it stores floats)
        if (this._writeIndex > 1.5e9){
            var buffersToRewind = Math.floor(this._readIndex/this._length);
            buffersToRewind--;

            this._readIndex -= buffersToRewind*this._length;
            this._writeIndex -= buffersToRewind*this._length;
            console.log('Just rewound the pointers samples rewound: ' + buffersToRewind*this._length)
        }
    }

    // Prepare the heart filter
    setUpHeartFilter() {
        let node = new BiquadNode();
        node.setHighpass2(15, 0.707107);
        this.heartFilters['hp'] = node;
        node = new BiquadNode();
        node.setPeaking(40, 0.7071, 6);
        this.heartFilters['peek'] = node;
        node = new BiquadNode();
        node.setLowpass2(200, 0.707107);
        this.heartFilters['lp'] = node;
        node = new BiquadNode();
        node.setBW4Section(250, 0);
        this.heartFilters['bwhp'] = node;
        node = new BiquadNode();
        node.setBW4Section(250, 1);
        this.heartFilters['bw'] = node;
        node = new BiquadNode();
        node.setHighpass2(20, 0.5);
        this.heartFilters['hp1'] = node;
        node = new BiquadNode();
        node.setPeaking(160, 1.0, 2.0);
        this.heartFilters['peek1'] = node;
        node = new BiquadNode();
        node.setPeaking(600, 2.0, -3.0);
        this.heartFilters['peek2'] = node;
        node = new BiquadNode();
        node.setPeaking(2100, 4.5, 12.0);
        this.heartFilters['peek3'] = node;
    }

    // Prespare the lung filters
    setUpLungFilter() {
        let node = new BiquadNode();
        node.setHighpass2(80, 0.707107);
        this.lungFilters['hp'] = node;
        node = new BiquadNode();
        node.setLowpass2(400, 0.707107);
        this.lungFilters['lp'] = node;
        node = new BiquadNode();
        node.setBW4Section(1500, 0);
        this.lungFilters['bw'] = node;
        node = new BiquadNode();
        node.setBW4Section(1500, 1);
        this.lungFilters['bw1'] = node;
        node = new BiquadNode();
        node.setHighpass2(20, 0.5);
        this.lungFilters['hp1'] = node;
        node = new BiquadNode();
        node.setPeaking(160, 1.0, 2.0);
        this.lungFilters['peek1'] = node;
        node = new BiquadNode();
        node.setPeaking(600, 2.0, -3.0);
        this.lungFilters['peek2'] = node;
        node = new BiquadNode();
        node.setPeaking(2100, 4.5, 12.0);
        this.lungFilters['peek3'] = node;
    }

    // Apply the heart filters
    heartFilter(arraySequence, gain) {
        arraySequence = this.heartFilters['hp'].process(arraySequence);
        arraySequence = this.heartFilters['peek'].process(arraySequence);
        arraySequence = this.heartFilters['lp'].process(arraySequence);
        arraySequence = this.heartFilters['bwhp'].process(arraySequence);
        arraySequence = this.heartFilters['bw'].process(arraySequence);
        arraySequence = this.heartFilters['hp1'].process(arraySequence);
        arraySequence = this.heartFilters['peek1'].process(arraySequence);
        arraySequence = this.heartFilters['peek2'].process(arraySequence);
        arraySequence = this.heartFilters['peek3'].process(arraySequence);
        arraySequence = this.heartGainMaximize(arraySequence, arraySequence.length, gain);
        arraySequence = this.heartFilters['peek3'].processGain(arraySequence, parseFloat(gain));
        return arraySequence;
    }

    // Apply lung filters
    lungFilter(arraySequence, gain) {
        arraySequence = this.lungFilters['hp'].process(arraySequence);
        arraySequence = this.lungFilters['lp'].process(arraySequence);
        arraySequence = this.lungFilters['bw'].process(arraySequence);
        arraySequence = this.lungFilters['bw1'].process(arraySequence);
        arraySequence = this.lungFilters['hp1'].process(arraySequence);
        arraySequence = this.lungFilters['peek1'].process(arraySequence);
        arraySequence = this.lungFilters['peek2'].process(arraySequence);
        arraySequence = this.lungFilters['peek3'].process(arraySequence);
        // arraySequence = this.stethFilter_getAppropriateGainLung(arraySequence, arraySequence.length);
        arraySequence = this.lungFilters['peek3'].processGain(arraySequence, parseFloat(gain));
        return arraySequence;
    }

    peakDetect(x, current, decayConstant) {
        let peak = Math.abs(x);
        if(peak > current)
            current = peak;
        else
            current *= (1.0-decayConstant);
        return current;
    }

    // Apply heart audio gain
    heartGainMaximize(io, currentChunkSize, manualGain = 1) {
        const gProcessingSampleRate = 16000;
        const gMaxSignalHeart = 1.5;
        const gMinHeartGain = 2.0;
        if(!this.heart_currentGain) {
            this.heart_currentGain = (typeof manualGain === "string") ? parseFloat(manualGain) : manualGain;
        }
        //gain will never be set higher than this
        const maxGain = 80.0;
        const maxNoise = 0.5; //noise above this will halt gain changes
        //const float holdEstimateTime = 0.75; //seconds

        let peakInitialEstimate = 0.1;
        let peakHeldEstimate = 0.1;
        
        let debugCounter = 0;
        
        let noiseDecay = (1.0 / (0.5 * gProcessingSampleRate)); //500ms peak decay
        let noisePeak = 0.0;
        
        //int holdEstimateSamples = (int)(holdEstimateTime * gProcessingSampleRate);

        let peakInitialDecayAlpha = (1.0 / (1.0 * gProcessingSampleRate)); //peak level initial est TC (1 second)
        let peakHeldAttackAlpha = (1.0 / (4.0 * gProcessingSampleRate));
        let peakHeldDecayAlpha = (1.0 / (2.0 * gProcessingSampleRate)); //peak hold decay TC to the initial peak estimate (2 seconds)

        //Gain smoothing time constant
        let gainIncreaseAlpha = (1.0 / (1.0 * gProcessingSampleRate)); //1 second
        let gainDecreaseAlpha = (1.0 / (1.0 * gProcessingSampleRate)); //1 second
        
        let nse, level, gainTarget, alpha;
        let k;
        let noiseDisable = 0;
        let statusStr;
        
        //Maintain an estimate of peak level using initial and final estimates.


        for(k = 0; k < currentChunkSize; ++k)
        {
            level = Math.abs(io[k]);
            this.runBiquad.setHighpass2(250, 0.707107);
            nse = this.runBiquad.process(io[k]);
            // nse = runBiquad(&HighPass250, gProcessingSampleRate, io[k]);
            
            noisePeak = this.peakDetect(nse, noisePeak, noiseDecay);
            //peakDetect(level, &lowPeak, signalDecay);
            
            if(noisePeak < maxNoise) {
                if(level > peakInitialEstimate) {
                    peakInitialEstimate = level; //typically this is a loud heartbeat but might be noise

                    peakHeldEstimate = level;
                } else {
                    peakInitialEstimate += peakInitialDecayAlpha * (level - peakInitialEstimate);
                }
            } else {
                noiseDisable = 1;
            }
            
            if(peakInitialEstimate > peakHeldEstimate) {
                peakHeldEstimate += peakHeldAttackAlpha * (peakInitialEstimate - peakHeldEstimate);
            } else {
                //Now the initial estimate drops, but we don't want to drop the held estimate right away,
                //instead slowly drop to the initial estimate.
                peakHeldEstimate += peakHeldDecayAlpha * (peakInitialEstimate - peakHeldEstimate);
            }
        }
        
        if(noiseDisable) {
            statusStr = "Disable";
        } else {
            statusStr = "Enable";
        }
        
        //prevent zero division
        if(peakHeldEstimate < 0.0001) {
            peakHeldEstimate = 0.0001;
        }
        
        gainTarget = gMaxSignalHeart / peakHeldEstimate;
        
        
        if(gainTarget > maxGain){
            gainTarget = maxGain;
        }
        
        if(gainTarget < gMinHeartGain){
            gainTarget = gMinHeartGain;
        }
        
        //smoothly change the gain
        
        let hgain = this.heart_currentGain; //Global heart_currentGain

        if(hgain < Number.MIN_VALUE) {
            hgain = Number.MIN_VALUE; //prevent divide by zero
        }

        for(k = 0; k < currentChunkSize; ++k) {
            alpha = gainTarget > hgain ? gainIncreaseAlpha : gainDecreaseAlpha;
            hgain += alpha * (gainTarget - hgain);
            io[k] *= hgain;
        }
    
        if(++debugCounter > 10) {
            debugCounter = 0;
            console.log(`noise ${noisePeak}: ${statusStr}, finalpk ${peakHeldEstimate}, gain ${hgain}, Fs ${gProcessingSampleRate}`);
            // printf("noise %f: %s, finalpk %f, gain %f, Fs %f\n", noisePeak, statusStr, peakHeldEstimate, hgain, gProcessingSampleRate);
        }
        
        this.heart_currentGain = hgain;

        return io;
    }

    // Apply only gain filter
    gainFilter(arraySequence, gain) {
        arraySequence = this.heartFilters['peek3'].processGain(arraySequence, gain);
        return arraySequence;
    }

    // Apply lung gain filter
    stethFilter_getAppropriateGainLung(buffer, frames) {
        const gProcessingSampleRate = 16000;
        const gLungGainDesiredAverage = 0.1;

        let sampleGain = 0.0;
        let kAlpha = 1.0 / (gProcessingSampleRate * 5.0);
        let kFast = 1.0 / (gProcessingSampleRate * 0.02);
        
        // if (shouldCalculateGain(frames)) { }
        for (let count = 0; count < frames; count++) {
            this.lung_historical_average = (kAlpha * Math.abs(buffer[count])) + (1.0 - kAlpha) * this.lung_historical_average;
        }
    
        let lung_gain = gLungGainDesiredAverage*1.0/this.lung_historical_average;
    
        if (lung_gain > 10.0) // change to double or triple, brighten up screen, goal is lung_gain * audio [0..1.00] == 1.0
            lung_gain = 10.0;
        if (lung_gain < 0.1)
            lung_gain = 0.1;
        
        for (let count = 0; count <frames; count++)
        {
            //1st order (pole only) IIR filter applied to gain per sample
            sampleGain += kFast * (lung_gain - sampleGain);
            buffer[count] *= sampleGain;
        }

        return buffer;
    }

    /**
     * Pull data out of buffer and fill a given sequence of Float32Arrays.
     *
     * @param  {array} arraySequence An array of Float32Arrays.
     */
    pull(arraySequence, ignoreWritePointer, step = 1.0) {
        // The channel count of arraySequence and the length of each channel must
        // match with this buffer obejct.

        // if we are looping over a recorded sound, we can ignore the writePtr, just let the read loop through the audio.
        let destinationLength = arraySequence[0].length;
        if (!ignoreWritePointer) {
            // If the FIFO is not big enough to do its trick, do nothing FOR A WHOLE BUFFER, allows buffer to fill with a little less jarring noise.
            if ((this._writeIndex - this._readIndex) < destinationLength) {
                return;
            }
        }

        // Do nothing for a while so that the buffer can fill up
        if(this._channelData[0].length < 4000) {
            return;
        }

        // Transfer data from the internal buffer to the |arraySequence| storage.
        for (let i = 0; i < destinationLength; ++i) {
            this._readIndex += step;
            let actualIndex = Math.round(this._readIndex) % this._length;
            for (let channel = 0; channel < this._channelCount; ++channel) {
                arraySequence[channel][i] = this._channelData[channel][actualIndex];
            }
        }
    }

    // play tries to keep things real time.
    play(arraySequence, ignoreWritePointer) {

        // console.log('WriteIndex: ', this._writeIndex);
        // console.log('ReadIndex: ', this._readIndex);
        // console.log('Destination length: ', arraySequence[0].length);

        // The channel count of arraySequence and the length of each channel must
        // match with this buffer obejct.
        var step = 1.00;
        if (!ignoreWritePointer) {
            let destinationLength = arraySequence[0].length;
            const diff = this._writeIndex - this._readIndex;

            // If the FIFO is not big enough to do its trick, do nothing FOR A WHOLE BUFFER, allows buffer to fill with a little less jarring noise.
            if ((this._writeIndex - this._readIndex) < destinationLength) {
                // console.log("skipped playback - bad - not enough sound data coming through");
                return;
            }
            // step = 0.40;
            // if (diff < 20000) {
            //     console.log("data shortage - slowing down");
            //     step = 0.93;
            // }
            // if (diff > 50000) {
            //     console.log("buffer too large - catching up");
            //     step = 1.06;
            // }
            // if (diff > 150000) {
            //     console.log("buffer waaayy too large - catching up");
            //     step = 1.15;
            // }
        }
        this.pull(arraySequence, ignoreWritePointer, step)
    }

} // class RingBuffer

 
class BiquadNode {
  constructor() {
    this.sampleRate = 16000;
    this.swap = 0;
    this.a0 = 1.0;
    this.a1 = 0.0;
    this.a2 = 0.0;
    this.b1 = 0.0;
    this.b2 = 0.0;
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
  }

  setLowpass2(freq, Q) {
    var w = Math.tan((Math.PI * freq) / this.sampleRate);

    if (Q < 0.5) {
      Q = 0.5;
    }

    if (w < 1e-5) {
      //somewhat arbitrary low-frequency limit
      w = 1e-5;
    }

    var W = 1.0 / w;
    var b = 1.0 / Q;

    var dn = (W + b) * W + 1.0;

    if (dn < 1e-6) {
      dn = 1e-6; //prevent divide by zero
    }

    var D = 1.0 / dn;
    this.a0 = D;
    this.a1 = 2.0 * D;
    this.a2 = D;
    this.b1 = 2.0 * (1.0 - W * W) * D;
    this.b2 = ((W - b) * W + 1.0) * D;
  }

  setHighpass2(freq, Q) {
    var w = Math.tan((Math.PI * freq) / this.sampleRate);

    if (Q < 0.5) {
      Q = 0.5;
    }

    if (w < 1e-5) {
      //somewhat arbitrary low-frequency limit
      w = 1e-5;
    }

    var W = 1.0 / w;
    var b = 1.0 / Q;

    var dn = (W + b) * W + 1.0;

    if (dn < 1e-6) {
      dn = 1e-6; //prevent divide by zero
    }

    var D = 1.0 / dn;
    this.a0 = W * W * D;
    this.a1 = -2.0 * this.a0;
    this.a2 = this.a0;
    this.b1 = 2.0 * (1.0 - W * W) * D;
    this.b2 = ((W - b) * W + 1.0) * D;
  }

  setPeaking(freq, Q, dB) {
    if (Q < 0.5) {
      Q = 0.5;
    }

    if (freq < 5) {
      //somewhat arbitrary low-frequency limit
      freq = 5;
    }

    var V = Math.pow(10.0, Math.abs(dB) / 20.0);

    var K = Math.tan((Math.PI * freq) / this.sampleRate);

    var norm;

    if (dB >= 0) {
      norm = 1 / (1 + (1 / Q) * K + K * K);
      this.a0 = (1 + (V / Q) * K + K * K) * norm;
      this.a1 = 2 * (K * K - 1) * norm;
      this.a2 = (1 - (V / Q) * K + K * K) * norm;
      this.b1 = this.a1;
      this.b2 = (1 - (1 / Q) * K + K * K) * norm;
    } else {
      norm = 1 / (1 + (V / Q) * K + K * K);
      this.a0 = (1 + (1 / Q) * K + K * K) * norm;
      this.a1 = 2 * (K * K - 1) * norm;
      this.a2 = (1 - (1 / Q) * K + K * K) * norm;
      this.b1 = this.a1;
      this.b2 = (1 - (V / Q) * K + K * K) * norm;
    }
  }

  //Two biquads: section 0 then section 1
  setBW4Section(freq, section) {
    var opt, b;

    if (section) opt = 7.0;
    else opt = 5.0;

    b = -2.0 * Math.cos((opt * Math.PI) / 8.0);

    this.setLowpass2(freq, 1.0 / b);
  }

  //Two biquads: section 0 then section 1
  setBW4HPSection(freq, section) {
    var opt, b;

    if (section) opt = 7.0;
    else opt = 5.0;

    b = -2.0 * Math.cos((opt * Math.PI) / 8.0);

    this.setHighpass2(freq, 1.0 / b);
  }

  processGain(inputChannel, gain) {
    if(typeof inputChannel === 'undefined') {
        return true;
    } 
    for(var k = 0; k < inputChannel.length; ++k) {
        inputChannel[k] = inputChannel[k] * gain;
    }
    return inputChannel;
  }

  process(inputChannel) {

    if (typeof inputChannel === "undefined") {
      return true;
    }

    for (var k = 0; k < inputChannel.length; ++k) {
      var x = inputChannel[k];

      if (this.swap) {
        var y =
          this.a0 * x +
          this.a1 * this.x1 +
          this.a2 * this.x2 -
          this.b1 * this.y1 -
          this.b2 * this.y2;
        this.x2 = x;
        this.y2 = y;
        this.swap = 0;
      } else {
        var y =
          this.a0 * x +
          this.a1 * this.x2 +
          this.a2 * this.x1 -
          this.b1 * this.y2 -
          this.b2 * this.y1;
        this.x1 = x;
        this.y1 = y;
        this.swap = 1;
      }

      inputChannel[k] = y;
    }

    return inputChannel;
  } //process
}

