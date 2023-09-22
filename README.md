# Spectrogram Drawer

Spectrogram drawer for heart, lung and bowel sounds

### Install the NPM Module

```sh
npm i spectrogram-drawer --save
```

### Usage

#### 1. Import `AudioEngine`

```ts
import AudioEngine from 'spectrogram-drawer';
```

#### 2. Add Canvas to View:

```html
    <canvas id="canvasID"></canvas>
```
#### 3. Initialize:

```ts
    let config = {mode: 'HEART', gain: 1 };
    this.audioEngine = await AudioEngine.initAudioEngine('canvasID', 'YOUR_SDK_KEY', config);
    this.audioEngine.startIt(false).then((res) => {
      this.audioEngine.loadOpusDecoder();
    });
```
Config:
 - mode: 'HEART' | 'LUNG'
 - gain for HEART: minimum 1 to maximum 3
 - gain for LUNG: minimum 1 to maximum 20

#### 4. Send Audio input

##### Load Audio files

```ts
    const audioContext = new AudioContext();
    fetch('audio.wav')
    .then(response => response.arrayBuffer())
    .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
    .then(audioBuffer => {
        this.audioEngine.testAudioInput(audioBuffer.getChannelData(0));
    });
```

##### Live input stream with getUserMedia.

```ts
    navigator.mediaDevices.getUserMedia({audio: true})
    .then((stream) => {
      const context = new AudioContext({sampleRate: 16000});
        const source = context.createMediaStreamSource(stream);
        const processor = context.createScriptProcessor(1024, 1, 1);
    
        source.connect(processor);
        processor.connect(context.destination);
    
        processor.onaudioprocess = function(e) {
          this.audioEngine.testAudioInput(audioBuffer.getChannelData(0));
        };
    });
```



