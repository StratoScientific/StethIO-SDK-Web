import { Component, OnInit } from '@angular/core';
import AudioEngine from 'spectrogram-drawer';


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {

  title = 'sdk-test-app';
  playbackSpeedList = [0.25, 0.5, 0.75, 1, 1.25, 1.50, 1.75, 2];
  speed = 1;
  audioEngine;
  audioContext;
  mode;
  volume = 1;
  audioEngine1: any;

  constructor() {
  }

  ngOnInit() {
    this.initAudio().then(r => console.log("Initialted"));
  }


  async initAudio() {
    this.audioEngine = await new AudioEngine.default().initAudioEngine('canvas', 'va1vuCRG3fGDGB2ddGwjqQ==');
    let constraints = { audio: true } // add video constraints if required
    navigator.mediaDevices.getUserMedia(constraints)
      .then(async (stream) => {
        this.audioContext = new AudioContext();
        this.audioEngine.setAutoGainFlag(true);
        this.audioEngine.setFilterFlag(true);
        await this.audioEngine.startIt(false);
        this.audioEngine.loadOpusDecoder();
      })
  }

  modeSelected(event) {
    event.target.value == 'HEART' ? this.heartData() : this.lungData();
    this.mode = event.target.value;
  }

  speedSelected(event) {
    this.speed = event.target.value;
    if(this.audioEngine) {
      // this.audioEngine.pause();
      this.audioEngine.playbackSpeedChange(this.speed);
      // this.audioEngine.resume();/
    }
  }

  volumeSet(event) {
    if(this.audioEngine) {
      this.volume = event.target.value;
      let volume = this.volume/100;
      this.audioEngine.volumeSet(volume);
    }
  }

  volumeUp(up) {
    this.volume = up ? (Number(this.volume) + 1) : (Number(this.volume) - 1);
    if(this.audioEngine) {
      let volume = this.volume/100;
      this.audioEngine.volumeSet(volume);
    }
  }

  async heartData() {
    this.audioEngine = await new AudioEngine.default().initAudioEngine('canvas','va1vuCRG3fGDGB2ddGwjqQ==');
    this.audioEngine1 = await new AudioEngine.default().initAudioEngine('canvas1','va1vuCRG3fGDGB2ddGwjqQ==');
  }

  async lungData() {
    this.audioEngine = await AudioEngine.default.initAudioEngine('canvas','va1vuCRG3fGDGB2ddGwjqQ==', {mode: 'LUNG'});
  }

  start() {
    if(this.audioEngine) {
      this.audioEngine.startIt(false).then((res) => {
        this.audioEngine.loadOpusDecoder();
      });
    }
  }

  start1() {
    if(this.audioEngine1) {
      this.audioEngine1.startIt(false).then((res) => {
        this.audioEngine1.loadOpusDecoder();
      });
    }
  }

  pause() {
    this.audioEngine.pause();
  }

  pause1() {
    this.audioEngine1.pause();
  }

  resume() {
    this.audioEngine.resume();
  }

  stop() {
    this.audioEngine.stop();
  }

  loadAudioFile() {
    this.mode == 'HEART' ? this.createHeartInputFiles() : this.createLungInputFiles();
  }

  loadAudioFile1() {
    this.mode == 'HEART' ? this.createHeartInputFiles1() : this.createLungInputFiles();
  }

  // load audio from local file
  createLungInputFiles() {
    fetch('assets/lung.wav')
    .then(response => response.arrayBuffer())
    .then(arrayBuffer => this.audioContext.decodeAudioData(arrayBuffer))
    .then(audioBuffer => {
        this.audioEngine.testAudioInput(audioBuffer.getChannelData(0));
    });

  }

  createHeartInputFiles() {
    fetch('assets/heart.wav')
    .then(response => response.arrayBuffer())
    .then(arrayBuffer => this.audioContext.decodeAudioData(arrayBuffer))
    .then(audioBuffer => {
        this.audioEngine.testAudioInput(audioBuffer.getChannelData(0));
    });
  }

  createHeartInputFiles1() {
    fetch('assets/heart.wav')
    .then(response => response.arrayBuffer())
    .then(arrayBuffer => this.audioContext.decodeAudioData(arrayBuffer))
    .then(audioBuffer => {
        this.audioEngine1.testAudioInput(audioBuffer.getChannelData(0));
    });
  }

  // audio load from microphone
  startMicRecording() {
    navigator.mediaDevices.getUserMedia({audio: true})
    .then((stream) => {
      let self = this;
      const context = new AudioContext({sampleRate: 44100});
        const source = context.createMediaStreamSource(stream);
        const processor = context.createScriptProcessor(1024, 1, 1);

        // source.connect(processor);
        // processor.connect(context.destination);
        processor.onaudioprocess = function(e) {
          self.playAudioInput(e.inputBuffer);
        };
    });
  }
  
  playAudioInput(audioBuffer) {
    this.audioEngine.testAudioInput(audioBuffer.getChannelData(0));
  }

   muteMe(elem:any) {
     console.log(elem)
    elem.muted = true;
  }

  mute() {
    console.log(document.querySelectorAll("video, audio"))
    document.querySelectorAll("video, audio").forEach((elem) => this.muteMe(elem));
  }

  unMute() {
    this.volume = 1;
    this.audioEngine.volumeSet(1);
  }

  async startAll() {
    fetch('assets/heart.wav')
    .then(response => response.arrayBuffer())
    .then(arrayBuffer => this.audioContext.decodeAudioData(arrayBuffer))
    .then(audioBuffer => {
      this.audioEngine.testAudioInput(audioBuffer.getChannelData(0));
    });
  }
}
