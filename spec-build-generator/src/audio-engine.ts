// create a microphone node
// attach to context, etc.
// start processor
// import { puckJson } from './puck';
import { AudioDecoder } from './audio-decoder';
import { AudioEncoder } from './audio-encoder';
import { SpectrogramDrawer } from './spectrogram';

// const createBuffer = require('audio-buffer-from');
declare const WebAssembly: any;

// Overall operation:
// We use the AudioWorkletProcessor which as of this writing is only available in Chrome - (eg android and desktop, Samsung phones)
// The nice thing is that our SocketWorkletProcessor gets the data in a background thread and thus is immune to hiccups on the main thread.
// Everytime it gets a piece of data (128 samples) it passes them onto the main thread - here to this file
//  AudioEngine gets a 128 sample packet, then adds it to a queue of packets to deal with.
// These packets are encoded into Opus data (in another thread), and once encoded, we send the data via websocket to our
// server. This server plays with the audio, and returns it via websocket to handleSocketMessage.
// handleSocketMessage then adds these opus encoded buffers to be decoded (one at a time is important).
// When the Opus encoded buffer is turned into Float32 samples, these are passed to the SocketWorkletProcessor which stores them in a ring buffer. They are then output into the process() callback on the SocketWorkletProcessor.

// Another way?
// perhaps simpler to use this to record and send to server: https://jsbin.com/hedujihuqo/edit?js,console (not ios it seems)
// and then stream from the server an opus stream?

export default class AudioEngine {
    audioContext: AudioContext;
    micStream: MediaStream;
    micSourceNode: MediaStreamAudioSourceNode;
    encoder: any;
    decoder: any;

    socketWorkletNode: AudioWorkletNode;
    bufferSource: any;
    totalBytesIn: number;
    totalSamplesIn: number;
    totalBytesSent: number;
    decoderOperational: boolean;
    packetsToDecode: Array<Object>;
    decodingPackets: boolean;
    encodingBuffers: boolean;
    buffersToEncode: Array<Float32Array>;
    analyser: AnalyserNode;
    analyserBufferSize: number;
    analyserData: Float32Array;
    feedbackGain: number;
    refreshTimer: any;
    divID: string; // canvas ID
    lungGain = 5; // min 1 max 20
    heartGain = 1; // min 1 max 3
    mode: 'HEART' | 'LUNG' = 'HEART';
    lowAudioFlag: number = 0;
    instance: AudioEngine;
    spectrogramDrawer: SpectrogramDrawer;
    filterFunctions: any = {};
    decodedPackets: Array<any> = [];
    private newAudioFilter: any;
    private kAudioFrequencyExact = 44100.0;
    private importObject = {
        imports: {
          imported_func: function(arg) {
            console.log(arg);
          },
          wasi_unstable: () => {}
        }
    };
    biquadFilter: any;
    distortion: any;
    gainNode: any;
    convolver: any;
    isFilterEnabled: any;
    isAutoGainEnabled: any;
    endpoint = 'https://stagingapi.stethio.com';

    private constructor(divID: string, config) {

        this.audioContext = null;
        this.micStream = null;
        this.micSourceNode = null;

        this.encoder = null;
        this.decoder = null;

        this.socketWorkletNode = null;

        this.totalBytesIn = 0;
        this.totalSamplesIn = 0;
        this.totalBytesSent = 0;

        this.decoderOperational = false;
        this.packetsToDecode = [];
        this.decodingPackets = false;

        this.encodingBuffers = false;
        this.buffersToEncode = [];

        this.analyser = null;
        this.analyserBufferSize = 128;
        this.analyserData = null;
        this.feedbackGain = 1.0;

        this.refreshTimer = 0;
        this.divID = divID;
        this.lowAudioFlag = 0;
        this.isFilterEnabled = true;
        this.isAutoGainEnabled = true;

        if (config) {
            if (config.mode == 'HEART') {
                this.heartGain = +config.gain > 0 && +config.gain <= 3 ? +config.gain : 1;
                this.mode = 'HEART';
            } else if (config.mode == 'LUNG') {
                this.lungGain = +config.gain > 0 && +config.gain <= 20 ? +config.gain : 5;
                this.mode = 'LUNG';
            }
        }
    }

    async initAudioEngine (divId: string , sdkKey: string, config?: {mode: 'HEART' | 'LUNG', gain: any}) {
        try {
            const response  = await fetch(`${this.endpoint}/api/sdk/key/verify/?encrypt=false`, {
                method : "POST",
                redirect: 'follow', // manual, *follow, error
                referrerPolicy: 'no-referrer', // 
                headers: {
                    'Content-Type': 'application/json'
                },
                body : JSON.stringify({
                    data : {
                        key : sdkKey,
                        device_id : ''
                    }
                })
            });
            const data = await response.json();
            if(data.hasOwnProperty('is_active') && data['is_active'] == true) {
                if(this.instance === undefined){
                    this.instance = new AudioEngine(divId, config);
                }
                console.log('StethIO Spectrogram Initialized Successfully!');
                return this.instance;
            }
            console.log('SDK Key Invalid. StethIO Spectrogram Initialized Failed!');
            return;
        } catch(e) {
            console.log(e);
            console.log('SDK Key Invalid. StethIO Spectrogram Initialized Failed!');
            return;
        }
    }

    async setAutoGainFlag(isAutoGainEnabled: boolean) {
        this.isAutoGainEnabled = isAutoGainEnabled;
    }
    async setFilterFlag(isFilterEnabled: boolean) {
        this.isFilterEnabled = isFilterEnabled;
    }
    
    // start the audio chain.
    async startIt(liveInput: boolean) {

        // TODO: {sampleRate: 16000}
        this.audioContext = new AudioContext({sampleRate: 44100});
        // await this.initiliseFilter(true);
        
        /* Setting up audio filters variables */
        this.biquadFilter = this.audioContext.createBiquadFilter();
        this.distortion = this.audioContext.createWaveShaper();
        this.gainNode = this.audioContext.createGain();
        this.convolver = this.audioContext.createConvolver();

        // this.bufferSource = this.audioContext.createBufferSource();

        await this.audioContext.audioWorklet.addModule('https://cdn.jsdelivr.net/gh/StratoScientific/StethIO-SDK-Web/assets/steth-worklet-processor.js', {"credentials": "omit"})
        console.log('startIt start');

        // await this.audioContext.audioWorklet.addModule('assets/steth-worklet-processor.js', {"credentials": "omit"});
        console.log('startIt');
        return this.onModuleAdded(liveInput);
        /* try {
            WebAssembly.instantiateStreaming(window.fetch('http://localhost:3000/StethAudioFilters.wasm'), this.importObject)
            .then(async (obj) => {
              this.filterFunctions = obj.instance.exports;
              console.log('fetched: ', Object.keys(this.filterFunctions));
            })
            .catch(err => {
                console.log('Unable to get WASM files. Please try again later: ', err);
                alert('Unable to get WASM files. Please try again later !');
                //window.history.back();
            });
        } catch (err) {
            return false;
        } */
        
    }

    /* Initialse the audio filter function */
    // async initiliseFilter(audioType) {

    //     return;

    //     /* if (!this.filterFunctions) {
    //         try {
    //             // tslint:disable-next-line: max-line-length
    //             const obj = await WebAssembly.instantiateStreaming(fetch('http://localhost:3000/StethAudioFilters.wasm'), this.importObject);
    //             this.filterFunctions = obj.instance.exports;
    //             console.log('fetched: ', Object.keys(this.filterFunctions));
    //         } catch (err) {
    //             console.log('Unable to get WASM files. Please try again later: ', err);
    //             alert('Unable to get WASM files. Please try again later !');
    //             //window.history.back();
    //         }
    //     }

    //     // Get the initial filter object pointer refenrence
    //     this.newAudioFilter = this.filterFunctions.glsteth_filter_NEW();

    //     // Add more filters internally
    //     this.parseBiquadFilter(audioType);

    //     // Initialise audio processing method call
    //     this.filterFunctions.initializeAudioProcessing(); */

    // }

    pause() {
        this.spectrogramDrawer.haltDisplay();
        this.socketWorkletNode.port.postMessage({
            type: 'setState', state: 'kPause',
            filterFunctions: JSON.stringify(this.filterFunctions),
            newAudioFilter: this.newAudioFilter
        });
    }

    resume() {
        this.spectrogramDrawer.resumeDisplay();
        this.socketWorkletNode.port.postMessage({
            type: 'setState', state: 'kRecordRemote',
            filterFunctions: JSON.stringify(this.filterFunctions),
            newAudioFilter: this.newAudioFilter
        });
    }

    close() {
        if(this.spectrogramDrawer) {
            this.spectrogramDrawer.haltDisplay();
        }
        if (this.micStream) {
            for (const track of this.micStream.getTracks()) {
                track.stop();
            }
        }

        if (this.audioContext && this.audioContext.state != 'closed') {
            this.audioContext.close();
            this.audioContext = null;
        }

        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
        // DEBUG: Uncomment to get all the decoded audio packets at call end in console
        // console.log(this.decodedPackets);
    }

    stop() {
        if(this.spectrogramDrawer) {
            this.spectrogramDrawer.stopDisplay();
            this.socketWorkletNode.port.postMessage({
                type: 'setState', state: 'kPause',
                filterFunctions: JSON.stringify(this.filterFunctions),
                newAudioFilter: this.newAudioFilter
            }); 
        }
    }

    /* Volume alter functionalities */
    volumeSet(value) {
        this.socketWorkletNode.port.postMessage({
            type: 'volume', volume: value, heartMode: (this.mode == 'HEART')
        });
    }
    /* Volume alter functionalities */

    /* Playback speed functionalities*/
    playbackSpeedChange(speed) {
        if(this.spectrogramDrawer) {
            this.spectrogramDrawer.alterPlayBackSpeed(speed * 100);
        }
    }
    /* Playback speed functionalities*/

    // we have the worklet loaded, now set up the audio chain
    async onModuleAdded(liveInput: boolean) {
        // we can now make a microphone
        // CHROME - echo cancellation only works for us on Android. On Desktop it does not work:
        // https://bugs.chromium.org/p/chromium/issues/detail?id=687574
        let heartMode = this.mode == 'HEART';

        let constraints;
        if(heartMode) {
            constraints = {
                audio: {
                    echoCancellation: false, // {exact: true},
                    googEchoCancellation: { exact: false },
                    channelCount: 2,
                    autoGainControl: false,
                    noiseSuppression: false,
                    //echoCancellationType: 'browser', // https://developers.google.com/web/updates/2018/06/more-native-echo-cancellation
                    sampleRate: 44100
                }
            };
        } else {
            constraints = {
                audio: {
                    echoCancellation: false, // {exact: true},
                    googEchoCancellation: { exact: false },
                    channelCount: 2,
                    autoGainControl: false,
                    noiseSuppression: false,
                    //echoCancellationType: 'browser', // https://developers.google.com/web/updates/2018/06/more-native-echo-cancellation
                    sampleRate: 44100
                }
            };
        }

        await this.loadOpusEncoder();

        // resampler
        // if (this.audioContext.sampleRate !== 16000) {
        //     console.log('Worklet Resampler enabled. To/From ' + this.audioContext.sampleRate + ' to 16000 Hz');
        //     const kMaxResamplerBuffer = 5000; // with one channel, Resampler buffer needs to be big enough, not exact. We dont know our buffer sizes!
        //     this.resamplerTo48 = new Resampler(this.audioContext.sampleRate, 16000, 1, kMaxResamplerBuffer);
        //     this.resamplerFrom48 = new Resampler(16000, this.audioContext.sampleRate, 1, kMaxResamplerBuffer);
        // }

        // Add lung noise gate
        // await this.audioContext.audioWorklet.addModule('/assets/js/LungNoiseGate.js');
        // Add auto gain
        // await this.audioContext.audioWorklet.addModule('/assets/js/LungAutoGain.js');

        // microphone
        this.micStream = await navigator.mediaDevices.getUserMedia(constraints);
        this.micSourceNode = this.audioContext.createMediaStreamSource(this.micStream);

        // the background thread processor that gets the bytes
        this.socketWorkletNode = new AudioWorkletNode(this.audioContext, 'socket-worklet');
        // this.micSourceNode.connect(this.socketWorkletNode);
        this.socketWorkletNode.connect(this.audioContext.destination);
        this.spectrogramDrawer = new SpectrogramDrawer(this.audioContext, this.divID, heartMode);
        this.spectrogramDrawer.beginDisplay();
        // Note: This means it will show graph of unfiltered audio
        this.socketWorkletNode.connect(this.spectrogramDrawer.analyserNode);
        // Note: Not working
        // this.spectrogramDrawer.analyserNode.connect(this.audioContext.destination);

        /*
            Audio filtering initialisation
            Set biquad filter based on the heart / lung mode
        */
        // this.analyser = this.audioContext.createAnalyser();
        // this.micSourceNode.connect(this.analyser);
        // this.analyser.connect(this.distortion);
        // this.distortion.connect(this.biquadFilter);
        // this.biquadFilter.connect(this.convolver);
        // this.convolver.connect(this.gainNode);
        // this.gainNode.connect(this.audioContext.destination);
        // if(heartMode){
        //     // this.connectHeartBiquad(true);
        //     await this.connectHeartBiquad(false);
        // } else {
        //     await this.connectLungBiquad(false);
        //     // this.connectLungBiquad(false);
        // }

        // analyser
        const useFeedBackAnaylser = false; // perhaps turn on for desktop Chrome, but get it working!
        if (useFeedBackAnaylser) {
            this.setUpFeedbackAnalyser();
        }
        // messaging
        // When we get de-compressed sound from the audio decoder, we send that to the audio processor, which adds it to a ring buffer,
        // so it can be played back. This is a little debug hello message.
        let state = 'kPause';
        if (liveInput) {
            // initial state is kRecordMic - current set up is when remote audio data is added will transition to kRecordRemote
            // recording is not happening yet...
            state = 'kRecordMic'; // these are defined at the top of steth-worklet-processor.js
        }
        // this.socketWorkletNode.port.postMessage({
        //     type: 'setState', state: state,
        //     filterFunctions: false, // this.filterFunctions.processAudio,
        //     // URL.createObjectURL(new Blob([this.filterFunctions.processAudio.toString()])),
        //     newAudioFilter: this.newAudioFilter
        // });
        /* , [
            this.filterFunctions.processAudio
        ] */
        // When the underlying audio processor gets a set of samples, it posts a message so we can encode the samples in opus and
        // send them via the web socket to the server.
        // this.socketWorkletNode.port.onmessage = this.handleWorkletProcessorMessage;
        console.log('moduleloaded', liveInput, this.socketWorkletNode, state);
        return true;
    }

    /*Not using at this moment*/
    // adding heart biquad filter
    connectHeartBiquad(single = true) {
        if(single) {
            this.biquadFilter.type = "lowpass";
            this.biquadFilter.frequency.value = 250;
            // this.biquadFilter.gain.value = 25;
            this.micSourceNode.connect(this.biquadFilter);
        } else {
            // TODO: Automatic gain, lung gain and heart gain
            // Add gain node
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = 40; // Earlier 2
            // this.micSourceNode.connect(this.gainNode);
            // Filter 1
            this.biquadFilter.type = "highpass";
            this.biquadFilter.frequency.value = 15;
            this.biquadFilter.Q.value = 0.707107;
            this.gainNode.connect(this.biquadFilter);
            let biquadFilter1 = this.audioContext.createBiquadFilter();
            let biquadFilter2 = this.audioContext.createBiquadFilter();
            let biquadFilter3 = this.audioContext.createBiquadFilter();
            let biquadFilter4 = this.audioContext.createBiquadFilter();
            let biquadFilter5 = this.audioContext.createBiquadFilter();
            let biquadFilter6 = this.audioContext.createBiquadFilter();
            let biquadFilter7 = this.audioContext.createBiquadFilter();
            let biquadFilter8 = this.audioContext.createBiquadFilter();
            // Filter 2
            biquadFilter1.type = "peaking";
            biquadFilter1.frequency.value = 40;
            biquadFilter1.Q.value = 0.7071;
            biquadFilter1.gain.value = 6;
            this.biquadFilter.connect(biquadFilter1);
            // Filter 3
            biquadFilter2.type = "lowpass";
            biquadFilter2.frequency.value = 200;
            biquadFilter2.Q.value = 0.707107;
            biquadFilter1.connect(biquadFilter2);
            // Filter 4
            biquadFilter3.type = "lowpass";
            biquadFilter3.frequency.value = 200;
            biquadFilter3.Q.value = 1.306;
            biquadFilter2.connect(biquadFilter3);
            // Filter 5
            biquadFilter4.type = "lowpass";
            biquadFilter4.frequency.value = 200;
            biquadFilter4.Q.value = 0.541;
            biquadFilter3.connect(biquadFilter4);
            // Filter 6
            biquadFilter5.type = "highpass";
            biquadFilter5.frequency.value = 20;
            biquadFilter5.Q.value = 0.5;
            biquadFilter4.connect(biquadFilter5);
            // Filter 7
            biquadFilter6.type = "peaking";
            biquadFilter6.frequency.value = 160;
            biquadFilter6.Q.value = 1;
            biquadFilter6.gain.value = 2;
            biquadFilter5.connect(biquadFilter6);
            // Filter 8
            biquadFilter7.type = "peaking";
            biquadFilter7.frequency.value = 600;
            biquadFilter7.Q.value = 2;
            biquadFilter7.gain.value = -3;
            biquadFilter6.connect(biquadFilter7);
            // Filter 9
            biquadFilter8.type = "peaking";
            biquadFilter8.frequency.value = 2100;
            biquadFilter8.Q.value = 4.5;
            biquadFilter8.gain.value = 12;
            biquadFilter7.connect(biquadFilter8);

            // Note: Does not work
            // biquadFilter8.connect(this.audioContext.destination);
            biquadFilter8.connect(this.spectrogramDrawer.analyserNode);
        }
    }

    // adding heart biquad filter
    connectLungBiquad(single = true) {
        if(single) {
            // Add gain node
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = 2;
            this.micSourceNode.connect(this.gainNode);
            this.biquadFilter.type = "lowpass";
            this.biquadFilter.frequency.value = 400;
            // this.biquadFilter.gain.value = 25;
            this.biquadFilter.Q.value = 0.7071;
            this.gainNode.connect(this.biquadFilter);
            this.biquadFilter.connect(this.audioContext.destination);
        } else {
            var noiseGateNode = new AudioWorkletNode(this.audioContext, 'lung-noise-gate');
            var autoGainNode = new AudioWorkletNode(this.audioContext, 'lung-auto-gain');
            // this.micSourceNode.connect(noiseGateNode);
            // Add gain node
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = 60;
            noiseGateNode.connect(this.gainNode);
            // Filter 1
            this.biquadFilter.type = "highpass";
            this.biquadFilter.frequency.value = 80;
            this.biquadFilter.Q.value = 0.707107;
            this.gainNode.connect(this.biquadFilter);
            let biquadFilter1 = this.audioContext.createBiquadFilter();
            let biquadFilter2 = this.audioContext.createBiquadFilter();
            let biquadFilter3 = this.audioContext.createBiquadFilter();
            let biquadFilter4 = this.audioContext.createBiquadFilter();
            let biquadFilter5 = this.audioContext.createBiquadFilter();
            let biquadFilter6 = this.audioContext.createBiquadFilter();
            let biquadFilter7 = this.audioContext.createBiquadFilter();
            // Filter 2
            biquadFilter1.type = "lowpass";
            biquadFilter1.frequency.value = 400;
            biquadFilter1.Q.value = 0.707107;
            this.biquadFilter.connect(biquadFilter1);
            // Filter 3
            biquadFilter2.type = "lowpass";
            biquadFilter2.frequency.value = 1500;
            biquadFilter2.Q.value = 1.306;
            biquadFilter1.connect(biquadFilter2);
            // Filter 4
            biquadFilter3.type = "lowpass";
            biquadFilter3.frequency.value = 1500;
            biquadFilter3.Q.value = 0.541;
            biquadFilter2.connect(biquadFilter3);
            // Filter 5
            biquadFilter4.type = "highpass";
            biquadFilter4.frequency.value = 20;
            biquadFilter4.Q.value = 0.5;
            biquadFilter3.connect(biquadFilter4);
            // Filter 6
            biquadFilter5.type = "peaking";
            biquadFilter5.frequency.value = 160;
            biquadFilter5.Q.value = 1.0;
            biquadFilter5.gain.value = 2.0;
            biquadFilter4.connect(biquadFilter5);
            // Filter 7
            biquadFilter6.type = "peaking";
            biquadFilter6.frequency.value = 600;
            biquadFilter6.Q.value = 2.0;
            biquadFilter6.gain.value = -3.0;
            biquadFilter5.connect(biquadFilter6);
            // Filter 8
            biquadFilter7.type = "peaking";
            biquadFilter7.frequency.value = 2100;
            biquadFilter7.Q.value = 4.5;
            biquadFilter7.gain.value = 12;
            biquadFilter6.connect(biquadFilter7);

            // Note: Does not work
            // biquadFilter7.connect(this.spectrogramDrawer.analyserNode);
            // biquadFilter7.connect(this.audioContext.destination);
            biquadFilter7.connect(this.spectrogramDrawer.analyserNode);
            // autoGainNode.connect(this.audioContext.destination);
        }
    }
    /*Not using at this moment*/

    // data coming back on websockets via the server, as encoded Opus packets
    // not currently used in StethIO
    audioInput = (arrayBuffer: ArrayBuffer) => {
        // arrayBuffer = arrayBuffer.slice(); // duplicate since I don't know who owns this, and I am sending it to be encoded in a worker thread
        this.totalBytesIn += arrayBuffer.byteLength;
        // console.log("Worlet bytes from socket: " + arrayBuffer.byteLength);
        // we need to pass the decoder an object with a data member as an ArrayBuffer,
        if (this.decoder == null) {
            // this is an async call. So we need to store packets that come in after
            this.decoderOperational = false;
            this.packetsToDecode = [];
            this.loadOpusDecoder().then(() => {
                this.decoderOperational = true;
            }, function(info) {console.log('decoder.decode error'); });
            return;
        }

        // add the packet to the queue
        const packet = {data: arrayBuffer};
        this.packetsToDecode.push(packet);
        if (!this.decoderOperational && this.packetsToDecode.length < 3) {
            return;
        }
        // console.log("this.packetsToDecode: ",this.packetsToDecode);
        // This call does things in order.
        this.decodePackets();
    }

    // To test with already exsisting decoded audio array
    testAudioInput = (arrayBuffer: Array<number>) => {
        let heartMode = this.mode == 'HEART';
        if(this.socketWorkletNode) {
            this.socketWorkletNode.port.postMessage({
                type: 'samples', samples: arrayBuffer,
                heartMode, gain: (heartMode) ? this.heartGain : this.lungGain,
                isAutoGainEnabled: this.isAutoGainEnabled,
                isFilterEnabled: this.isFilterEnabled
            });
        }
    }

    workerCros(url) {
        const iss = "importScripts('" + url + "');";
        return URL.createObjectURL(new Blob([iss]));
    }

    // returns promise on eventual success
    async loadOpusEncoder() {
        // https://kazuki.github.io/opus.js-sample/
        
        const workerUrl = this.workerCros(new URL('https://cdn.jsdelivr.net/gh/StratoScientific/StethIO-SDK-Web/assets/opus_encoder.js', window.location + '').href);
        this.encoder = new AudioEncoder(workerUrl);

        // this.encoder = new AudioEncoder('./assets/opus_encoder.js');
        console.log(this.encoder);

        // "2048">VoIP
        // "2049" selected="selected">Audio
        // "2051">Restricted Low Delay
        // Sample rate used to be 48000 but since mobile changed to 16000
        const enc_cfg = {
            sampling_rate: 44100,
            num_of_channels: 1,
            params: {
                application: 2049,
                sampling_rate: 48000,
                frame_duration: 20 // ms
            }
        };
        /* console.log('About to set up encoder '); */
        return this.encoder.setup(enc_cfg);
    }

    // header packets: the first (one? - how do I tell? )
    async loadOpusDecoder() {
        // https://kazuki.github.io/opus.js-sample/

        const workerUrl = this.workerCros(new URL('https://cdn.jsdelivr.net/gh/StratoScientific/StethIO-SDK-Web/assets/opus_decoder.js', window.location + '').href);
        this.decoder = new AudioDecoder(workerUrl);

        // this.decoder = new AudioDecoder('./assets/opus_decoder.js');
        this.decoderOperational = true;
        return this.decoder.setup({channels: 1, sampling_rate: 44100}, {}); // 48000
    }

    handleWorkletProcessorMessage = (event) => {
        console.log('At handle events: ', event.data.outputs);
        this.socketWorkletNode.port.postMessage({
            type: 'live',
            outputs: event.data.outputs
        });
    }

    // we get called when the worklet has a sample buffer.
    // here we are using Opus to encode (compress) the audio.
    old_handleWorkletProcessorMessage = (event) => {
        console.log('handleWorkletProcessorMessage: ', event);
        // console.log('[Worklet system got :Received] num samples: ' + event.data.samples.length);
        // handled on server now AudioUtils.adjustMicGain(event.data.samples, desiredAverageInput);

        // We might want to do feedback detection here. Chrome on mac has problems, all phones seem to do a great job,
        // safari mac does fine. (safari does not use this audio path as of early 2020)
        if (this.feedbackGain !== 1.0) {
            for (let i = 0; i < event.data.samples.length; i++) {
                event.data.samples[i] = event.data.samples[i] * this.feedbackGain;
            }
        }

        this.buffersToEncode.push(event.data.samples);
        this.queueBufferForEncodingAndSend();
    }

    // our Opus encoder does NOT like to be called more than once at a time.
    // so we need to use a queue, like decodePackets()
    // After buffers have been encoded on the Worker() thread by opus,
    // we push the data using websockets to the server
    async queueBufferForEncodingAndSend() {
        if (this.encodingBuffers) {
            return;
        }

        if (this.buffersToEncode.length === 0) {
            return; // we are done all the packets in the queue
        }

        // Not every call to this.encoder.encode will result in a packet emitted for the Websocket, that depends on how many
        // ms you set in the loadOpusEncoder.
        this.encodingBuffers = true;
        const allSamples = this.buffersToEncode.shift();

        // if (this.resamplerTo48) {
        //     // The resampler always seems to give the same returned buffer length, which is incorrect.
        //     // we let it slide though
        //     allSamples = this.resamplerTo48.resample(allSamples);
        // }

        const buffer = {timestamp: 0, samples: allSamples, transferable: true };

        // const [, webSocket] = await this.stream.getWebSocket();
        try {
            const packets = await this.encoder.encode(buffer);
            // we can and will get 0, 1 or 2 (or more?) packets here
            for (let i = 0; i < packets.length; ++i) {
                this.totalBytesSent += packets[i].data.byteLength;
                // console.log("Make a way to send packets to destination: " + packets[i].data.byteLength);
                // webSocket.send(packets[i].data);
            }
            this.encodingBuffers = false;
            this.queueBufferForEncodingAndSend(); // do some more if needed
        } catch (err) {
            console.log('encoder.encoder error', err);
        }
    }

    // needs to decode the passed packets
    // decodes them in order one at time.
    // If we submit 10 packets in quick succession, we don't get the promise firing in the same order, complex packets will take longer.
    // So decode them in order by starting on the next one only when we are done one from the this.packetsToDecode global.
    decodePackets() {
        let heartMode = this.mode == 'HEART';
        if (this.decodingPackets) {
            return;
        }

        if (this.packetsToDecode.length === 0) {
            return; // we are done all the packets in the queue
        }

        this.decodingPackets = true;
        const packet: any = this.packetsToDecode.shift();
        // console.log("Decoder array buffer length: ", packet.data.byteLength);
        this.decoder.decode(packet).then((buf) => {
            if(buf.samples) {
                this.totalSamplesIn += buf.samples.length;
                // if (this.resamplerFrom48) {
                //     buf.samples = this.resamplerFrom48.resample(buf.samples);
                // }
                // let source = this.audioContext.createBufferSource();
                // source.buffer = createBuffer(buf.samples, {context: this.audioContext});
                // source.connect(this.audioContext.destination);
                // source.start(0);
                this.decodedPackets.push(buf.samples);
                if(this.socketWorkletNode) {
                    // console.log(buf.samples);
                    // console.log(localStorage.getItem('heartGain'));
                    // console.log(localStorage.getItem('lungGain'));
                    // TODO: Check if the logic will increase audio if audio is very low
                    // let lowAudioFlag = 0;
                    // let actualAudioCounter = 0;
                    // buf.samples = buf.samples.map(sample => {
                    //     if(sample > 0 && sample * 1000 < 1){
                    //         lowAudioFlag++;
                    //         sample = sample * 100;
                    //         return sample;
                    //     } else if(sample < 0 && sample * -1000 < 1){
                    //         lowAudioFlag++;
                    //         sample = sample * 100;
                    //         return sample;
                    //     } else if(sample > 0) {
                    //         actualAudioCounter++;
                    //     }
                    // });
                    // if(lowAudioFlag > actualAudioCounter) {
                    //     this.lowAudioFlag++;
                    // }
                    // console.log(this.lowAudioFlag);
                    console.log(buf);
                    this.socketWorkletNode.port.postMessage({
                        type: 'samples', samples: buf.samples,
                        heartMode, gain: (heartMode) ? this.heartGain : this.lungGain
                    });
                }
            }

            // signal we are ready to do more. Call ourselves in case there are more to do.
            this.decodingPackets = false;
            this.decodePackets();

        }, function(info) {console.log('worklet decoder.decode error', info); }).catch(err => console.log("Unable to decode", err));
    }

    setUpFeedbackAnalyser() {
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyserData = new Float32Array(this.analyser.frequencyBinCount);
        this.refreshTimer = setInterval(() => this.refreshAnalyserData(), 50);
        this.micSourceNode.connect(this.analyser);
    }

    // the idea here is that we can perhaps work to reject feedback whine, which in my studies is characterized on my Mac Laptop/Chrome with loud sounds at 2 kHz but epspecially one at 6 kHz
    refreshAnalyserData() {
        this.analyser.getFloatFrequencyData(this.analyserData);

        // we have analyser.frequencyBinCount bins from 0 - 24,000 hz
        // feedback happens at frequencies above people's voices.
        // Voices are mostly below 1000Hz, feedback is above that...
        const kLowFreq = 100;
        const kMidFreq = 2000;
        const kTopFreq = 48000 / 2;

        // const HzPerBin = kTopFreq/this.analyser.frequencyBinCount;

        const kBinLow = kLowFreq / kTopFreq * this.analyser.frequencyBinCount;
        const kBinMid = kMidFreq / kTopFreq * this.analyser.frequencyBinCount;

        let powerAtLow = 0.0;
        let numAtLow = 0;
        let powerAtMid = 0.0;
        let numAtMid = 0;
        let powerAtHigh = 0.0;
        let numAtHigh = 0;

        let i;
        for (i = 0; i < this.analyser.frequencyBinCount; i++) {
            if (i < kBinLow) {
                powerAtLow += this.analyserData[i];
                numAtLow++;
            } else if (i < kBinMid) {
                powerAtMid += this.analyserData[i];
                numAtMid++;
            } else {
                powerAtHigh += this.analyserData[i];
                numAtHigh++;
            }
            // this will show a spectrum -
            // const chorus = '*';
            // console.log(Math.round(i*HzPerBin) + " " + chorus.repeat(140+this.analyserData[i]));
        }
        powerAtLow = powerAtLow / numAtLow;
        powerAtMid = powerAtMid / numAtMid;
        powerAtHigh = powerAtHigh / numAtHigh;

        this.feedbackGain = 1.0;

        if (powerAtMid * 1.3 < powerAtHigh) {
            this.feedbackGain = powerAtHigh / (powerAtMid * 1.3);
            console.log('feedback? gain is now: ' + this.feedbackGain);
        }

        console.log('power low: ' + powerAtLow + '   power mid: ' + powerAtMid + '   power hi: ' + powerAtHigh);
    }

    setInputEnabled(value) {
        if (this.micStream) {
            this.micStream.getAudioTracks()[0].enabled = value; // or false to mute it.
        }
    }

    setAudioBuffer(audioBuffer: AudioBuffer) {
        // SET the audio.
        // Used to load an entire file.
        let heartMode = this.mode == 'HEART';
        const allSamples = audioBuffer.getChannelData(0);
        this.socketWorkletNode.port.postMessage({
            type: 'setSamples', samples: allSamples,
            heartMode, gain: (heartMode) ? this.heartGain : this.lungGain
        });
    }

    addAudioSamples(samples: Float32Array) {
        // console.log('samples.length: ', samples.length);
        // console.log('samples.byteLength: ', samples.byteLength);
        // Add samples (EG 300 - 2000 samples from Twilio data). Audio is assumued to be at full rate (44100 or 48000 Hz)
        // so resampling may be needed before calling this.
        // Used to load an entire file.
        this.socketWorkletNode.port.postMessage({
            type: 'samples', samples: samples,
            filterFunctions: JSON.stringify(this.filterFunctions),
            newAudioFilter: this.newAudioFilter
        });
    }

    // interleaved PCM data in signed 16bits int (interleaving for one channel is meaningless)
    // I think data is coming in from Twilio at 3000Hz integer16 PCM but not sure.
    // Better would be to use Opus on the iOS and Android ends, then I already have a decoder
    async resampleAudio(int16SamplesAt3000Hz) {
        // Plan:
        // Use this library.
        // https://www.npmjs.com/package/speex-resampler
        // Create a resampler from 3000Hz to 44100 or 48000 (usually 48000 on most computers/phones except old macs/iphone)
        // this.resampler = new SpeexResampler(1, 3000, 48000);
        // const pcmData = Buffer.from(int16SamplesAt3000Hz /* interleaved PCM data in signed 16bits int */);
        // const res = await resampler.processChunk(pcmData);
    }

    // Audio filter logic
    // Get the filter config from json and add filters
    parseBiquadFilter(type = 'heart') {
        if (puckJson) {
        const iphone7 = puckJson['iphone7'];
        iphone7.forEach(item => {
            if (item.name === type && item.filter) {
            item.filter.forEach(f => {
                this.addFilter(f);
            });
            }
        });
        }
    }

    // Add filters to the model
    addFilter(filterModel) {

        let a0 = 0; let a1 = 0; let a2 = 0;
        let b1 = 0; let b2 = 0;

        // ref's are used for testing filter design and may be removed
        let refa0 = 0; let refa1 = 0; let refa2 = 0;
        let refb1 = 0; let refb2 = 0;

        const coeffs = [0.0, 0.0, 0.0, 0.0, 0.0];

        let decodedFilter = false;

        const type = filterModel.type;

        if (type == 'peak') {
        const freq = filterModel.freq || 0.0;
        let q = filterModel.q || 0.0;

        if (q == 0.0) {
            let width = filterModel.width || 0.0;
            if (width < 0.001) {
                width = 0.001;
            }
            q = this.filterFunctions.calculateQFromOctaveWidth(width);
        }

        const gain = filterModel.gain || 0.0;

        this.filterFunctions.calculateBiquadPeak(freq, this.kAudioFrequencyExact, q, gain, a0, a1, a2, b1, b2);

        decodedFilter = true;
        }

        if (type == 'lowpass2') {
        const freq = filterModel.freq || 0.0;
        const q = filterModel.q || 0.0;

        this.filterFunctions.calculateLP2(freq, this.kAudioFrequencyExact, q, coeffs);

        a0 = coeffs[0]; a1 = coeffs[1]; a2 = coeffs[2];
        b1 = coeffs[3]; b2 = coeffs[4];
        decodedFilter = true;
        }

        if (type == 'highpass2') {
        const freq = filterModel.freq || 0.0;
        const q = filterModel.q || 0.0;

        this.filterFunctions.calculateHP2(freq, this.kAudioFrequencyExact, q, coeffs);

        a0 = coeffs[0]; a1 = coeffs[1]; a2 = coeffs[2];
        b1 = coeffs[3]; b2 = coeffs[4];
        decodedFilter = true;
        }

        if (type == 'Butterworth4a') {
        const freq = filterModel.freq || 0.0;

        this.filterFunctions.calculateBW4Section(freq, this.kAudioFrequencyExact, 0, coeffs);

        a0 = coeffs[0]; a1 = coeffs[1]; a2 = coeffs[2];
        b1 = coeffs[3]; b2 = coeffs[4];
        decodedFilter = true;
        }

        if (type == 'Butterworth4b') {
        const freq = filterModel.freq || 0.0;

        this.filterFunctions.calculateBW4Section(freq, this.kAudioFrequencyExact, 1, coeffs);

        a0 = coeffs[0]; a1 = coeffs[1]; a2 = coeffs[2];
        b1 = coeffs[3]; b2 = coeffs[4];
        decodedFilter = true;
        }

        if (type == 'bandpass2') {
        const freq = filterModel.freq || 0.0;
        const q = filterModel.q || 0.0;

        this.filterFunctions.calculateBP2(freq, this.kAudioFrequencyExact, q, coeffs);

        a0 = coeffs[0]; a1 = coeffs[1]; a2 = coeffs[2];
        b1 = coeffs[3]; b2 = coeffs[4];
        decodedFilter = true;
        }

        if (type == 'raw') {
        a0 = filterModel.a0 || 0.0; a1 = filterModel.a1 || 0.0; a2 = filterModel.a2 || 0.0;
        b1 = filterModel.b1 || 0.0; b2 = filterModel.b2 || 0.0;
        decodedFilter = true;
        }

        if (filterModel.a0 != null) {
        // assume for now that the others are there
        refa0 = filterModel.a0 || 0.0; refa1 = filterModel.a1 || 0.0; refa2 = filterModel.a2 || 0.0;
        refb1 = filterModel.b1 || 0.0; refb2 = filterModel.b2 || 0.0;
        // Check out of bounds condition
        if (Math.abs(a0 - refa0) > 1e-7 || Math.abs(a1 - refa1) > 1e-7 ||
            Math.abs(a2 - refa2) > 1e-7 || Math.abs(b1 - refb1) > 1e-7 ||
            Math.abs(b2 - refb2) > 1e-7) {
            console.log(`Error designing ${filterModel} filter`);
        }
        }

        if (decodedFilter) {
        this.filterFunctions.glsteth_filter_addBiquad(this.newAudioFilter, a0, a1, a2, b1, b2);
        } else {
        console.log(`Failed to decode ${filterModel} filter`);
        }
    }

}

const puckJson = {
	"note": "Filter updates by Ray Miller with Puck EQ.",
	"date": "2020-04-01T13:21:58Z",
	"default": "iphone7",
	"devices": ["iphone7"],
	"iphone7": [    {
        "filter": [{
            "type": "highpass2",
            "freq": 15,
            "q": 0.707107,
            "note": "HP 15 Hz",
            "a0": 0.9984899566,
            "a1": -1.9969799132,
            "a2": 0.9984899566,
            "b1": -1.9969776329,
            "b2": 0.9969821934
        }, {
            "type": "peak",
            "note": "earlevel peak filter",
            "freq": 40,
            "q": 0.7071,
            "gain": 6
        }, {
            "type": "lowpass2",
            "freq": 200,
            "q": 0.707107,
            "note": "LP 200Hz fs 44100",
            "a0": 0.0001989714,
            "a1": 0.0003979428,
            "a2": 0.0001989714,
            "b1": -1.9597070338,
            "b2": 0.9605029194
        }, {
            "type": "Butterworth4a",
            "freq": 250,
            "note": "BW4A 250Hz fs 44100",
            "a0": 0.0003128802,
            "a1": 0.0006257604,
            "a2": 0.0003128802,
            "b1": -1.9718591139,
            "b2": 0.9731106348
        }, {
            "type": "Butterworth4b",
            "freq": 250,
            "note": "BW4B 250Hz fs 44100",
            "a0": 0.0003070422,
            "a1": 0.0006140845,
            "a2": 0.0003070422,
            "b1": -1.9350664333,
            "b2": 0.9362946022
        } ,{
            "type": "highpass2",
            "freq": 20,
            "q": 0.5,
            "note": "HP 20 Hz"
        }, {
            "type": "peak",
            "note": "peak filter",
            "freq": 160,
            "q": 1.0,
            "gain": 2.0
        }, {
            "type": "peak",
            "note": "peak filter",
            "freq": 600,
            "q": 2.0,
            "gain": -3.0
        },{
            "type": "peak",
            "note": "peak filter",
            "freq": 2100,
            "q": 4.5,
            "gain": 12.0
        }],
        "note": "",
        "name": "heart"
    }, {
        "filter": [{
            "type": "highpass2",
            "freq": 80,
            "q": 0.707107,
            "note": "HPF at 80 Hz, fs 44100",
            "a0": 0.9919727398,
            "a1": -1.9839454796,
            "a2": 0.9919727398,
            "b1": -1.9838810417,
            "b2": 0.9840099175
        }, {
            "type": "lowpass2",
            "freq": 400,
            "q": 0.707107,
            "note": "LPF at 400 Hz, fs 44100",
            "a0": 0.0007803263,
            "a1": 0.0015606526,
            "a2": 0.0007803263,
            "b1": -1.9194445715,
            "b2": 0.9225658767
        }, {
            "type": "Butterworth4a",
            "freq": 1500,
			"note": "BW4A 1500 Hz, fs 44100",
			"a0": 0.0105210738,
			"a1": 0.0210421475,
			"a2": 0.0105210738,
			"b1": -1.8077745420,
			"b2": 0.8498588371
        }, {
            "type": "Butterworth4b",
            "freq": 1500,
            "note": "BW4B, 1500 Hz, fs 44100",
            "a0": 0.0095112988,
            "a1": 0.0190225976,
            "a2": 0.0095112988,
            "b1": -1.6342708171,
            "b2": 0.6723160123
        } ,{
            "type": "highpass2",
            "freq": 20,
            "q": 0.5,
            "note": "HP 20 Hz"
        }, {
            "type": "peak",
            "note": "peak filter",
            "freq": 160,
            "q": 1.0,
            "gain": 2.0
        }, {
            "type": "peak",
            "note": "peak filter",
            "freq": 600,
            "q": 2.0,
            "gain": -3.0
        },{
            "type": "peak",
            "note": "peak filter",
            "freq": 2100,
            "q": 4.5,
            "gain": 12.0
        }],
		"note": "",
		"name": "lungs"
	}]
}


// export { AudioEngine };
window['AudioEngine'] = AudioEngine;
