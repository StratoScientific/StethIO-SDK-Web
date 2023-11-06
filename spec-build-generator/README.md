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
    this.audioEngine = await new AudioEngine.default().initAudioEngine('canvasID', 'YOUR_SDK_KEY');
    let constraints = { audio: true }
    navigator.mediaDevices.getUserMedia(constraints)
      .then(async (stream) => {
        this.audioContext = new AudioContext();
        await this.audioEngine.startIt(false);
        this.audioEngine.loadOpusDecoder();
      })
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
        
            processor.onaudioprocess = (e) => {
              this.audioEngine.testAudioInput(e.inputBuffer.getChannelData(0));
            };
        });
```

### Properties

##### 1. Pause
```ts
this.audioEngine.pause();
```
##### 2. Stop
```ts
this.audioEngine.stop();
```
##### 3. Resume
```ts
this.audioEngine.resume();
```
##### 4. Change Playback Speed
```ts
this.audioEngine.playbackSpeedChange(speed); // speed [0.25, 0.5, 0.75, 1, 1.25, 1.50, 1.75, 2]
```
##### 5. Disable Auto Gain and Noise Filters
```ts
this.audioEngine.setAutoGainFlag(false); // By default, the gain is enabled
this.audioEngine.setFilterFlag(false); // By default, the filter is enabled
```


##### `NOTE`: We are supporting 5 canvases to be displayed at the same time in a screen

