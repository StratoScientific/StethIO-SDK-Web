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
  mode;
  volume = 1;

  constructor() {
  }

  ngOnInit() {
  }

  modeSelected(event) {
    event.target.value == 'HEART' ? this.heartData() : this.lungData();
    this.mode = event.target.value;
  }

  speedSelected(event) {
    this.speed = event.target.value;
    if(this.audioEngine) {
      this.audioEngine.playbackSpeedChange(this.speed);
    }
  }

  volumeSet(event) {
    if(this.audioEngine) {
      this.volume = event.target.value;
      this.audioEngine.volumeSet(this.volume);
    }
  }
  
  volumeUp(up) {
    this.volume = up ? (Number(this.volume) + 1) : (Number(this.volume) - 1);
    if(this.audioEngine) {
      this.audioEngine.volumeSet(this.volume);
    }
  }

  async heartData() {
    this.audioEngine = await AudioEngine.initAudioEngine('canvas','va1vuCRG3fGDGB2ddGwjqQ==');
    console.log(this.audioEngine);
  }

  async lungData() {
    this.audioEngine = await AudioEngine.initAudioEngine('canvas','va1vuCRG3fGDGB2ddGwjqQ==', {mode: 'LUNG'});
  }

  start() {
    if(this.audioEngine) {
      this.audioEngine.startIt(false).then((res) => {
        this.audioEngine.loadOpusDecoder();
      });
    }
  }

  pause() {
    this.audioEngine.pause();
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

  // load audio from local file
  createLungInputFiles() {
    const audioContext = new AudioContext();
    fetch('assets/lung.wav')
    .then(response => response.arrayBuffer())
    .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
    .then(audioBuffer => {
        this.audioEngine.testAudioInput(audioBuffer.getChannelData(0));
    });
  }

  createHeartInputFiles() {
    const audioContext = new AudioContext();
    fetch('assets/heart.wav')
    .then(response => response.arrayBuffer())
    .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
    .then(audioBuffer => {
        this.audioEngine.testAudioInput(audioBuffer.getChannelData(0));
    });
  }

  // audio load from microphone
  startMicRecording() {
    navigator.mediaDevices.getUserMedia({audio: true})
    .then((stream) => {
      let self = this;
      const context = new AudioContext({sampleRate: 16000});
        const source = context.createMediaStreamSource(stream);
        const processor = context.createScriptProcessor(1024, 1, 1);
    
        source.connect(processor);
        processor.connect(context.destination);
    
        processor.onaudioprocess = function(e) {
          self.playAudioInput(e.inputBuffer);
        };
    });
  }
  
  playAudioInput(audioBuffer) {
    this.audioEngine.testAudioInput(audioBuffer.getChannelData(0));
  }

}
