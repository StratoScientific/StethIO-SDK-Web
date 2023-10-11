import "./App.css";
import AudioEngine from "spectrogram-drawer";
import { Component } from "react";

class App extends Component {
  constructor(props) {
    super(props);

    this.state = {
      audioEngine: null,
    };

    // Set mode - LUNG or HEART
    this.mode = "HEART";
  }

  componentDidMount() {
    this.heartData();
  }

  heartData = async () => {
    let aeInstance = await new AudioEngine().initAudioEngine("canvas", "YOUR_SDK_KEY");
    this.setState({ audioEngine: aeInstance });
  };

  lungData = async () => {
    let aeInstance = await new AudioEngine().initAudioEngine("canvas", "YOUR_SDK_KEY", {
      mode: "LUNG",
    });
    this.setState({ audioEngine: aeInstance });
  };

  start = () => {
    let constraints = { audio: true }
    navigator.mediaDevices.getUserMedia(constraints)
      .then(async (stream) => {
    	this.state.audioEngine.startIt(false).then((res) => {
         this.state.audioEngine.loadOpusDecoder();
       });
    }); 
  };

  loadAudioFile = () => {
    this.mode == "HEART"
      ? this.createHeartInputFiles()
      : this.createLungInputFiles();
  };

  // load audio from local lung file
  createLungInputFiles = () => {
    const audioContext = new AudioContext();
    fetch("PATH_TO_LUNG_FILE")
      .then((response) => response.arrayBuffer())
      .then((arrayBuffer) => audioContext.decodeAudioData(arrayBuffer))
      .then((audioBuffer) => {
        this.state.audioEngine.testAudioInput(audioBuffer.getChannelData(0));
      });
  };

  // load audio from local heart file
  createHeartInputFiles = () => {
    const audioContext = new AudioContext();
    fetch("PATH_TO_HEART_FILE")
      .then((response) => response.arrayBuffer())
      .then((arrayBuffer) => audioContext.decodeAudioData(arrayBuffer))
      .then((audioBuffer) => {
        this.state.audioEngine.testAudioInput(audioBuffer.getChannelData(0));
      });
  };

  // audio load from microphone
  startMicRecording = () => {
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      let self = this;
      const context = new AudioContext({ sampleRate: 16000 });
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(1024, 1, 1);

      source.connect(processor);
      processor.connect(context.destination);

      processor.onaudioprocess = function (e) {
        self.playAudioInput(e.inputBuffer);
      };
    });
  };

  playAudioInput = (audioBuffer) => {
    this.state.audioEngine.testAudioInput(audioBuffer.getChannelData(0));
  };

  speedSelected = (speed) => {
    if(this.state.audioEngine) {
      this.state.audioEngine.playbackSpeedChange(speed);
    }
  }

  volumeSet = (volume) => {
    if(this.state.audioEngine) {
      this.state.audioEngine.volumeSet(volume);
    }
  }

  pause = () => {
    this.state.audioEngine.pause();
  }

  resume = () => {
    this.state.audioEngine.resume();
  }

  stop = () => {
    this.state.audioEngine.stop();
  }

  
  render() {
    return (
      <div className="App">
        <div className="frame">
          <canvas id="canvas"></canvas>
        </div>

        <div className="actions">
          <div>
            <button onClick={() => this.start()}>Start</button>
            <button onClick={() => this.loadAudioFile()}>Load audio</button>
            <button onClick={() => this.startMicRecording()}>Microphone</button>
          </div>
        </div>
      </div>
    );
  }
}

export default App;
