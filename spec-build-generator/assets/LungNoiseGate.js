
class LungNoiseGate extends AudioWorkletProcessor {
  constructor() { 
    super(); 
    
    this.z1 = 0;
    this.p1 = 0;
    this.HF_Level = 0;

  }
  
  //When the highest frequencies are strong enough, drop the overall gain
  //to deal with noise from Spot movement.
  process (inputs, outputs, parameters) {
    const gProcessingSampleRate = 44100.0;
    const alpha = 1.0 / (0.01 * gProcessingSampleRate);
    const HFthresholdLevel = 0.002;
    const HFMaxGainReduction = 0.05;
    const highpassCutoff = 5000.0;
    

    //First-order high-pass filter
    var w = Math.tan(Math.PI * highpassCutoff / gProcessingSampleRate);
    var a0 = 1.0 / (1.0 + w);
    var b1 = (1.0 - w) / (1.0 + w);
    
    var sample;
    var reduceGain;

    var filtered = 0.0;
     
    const input0 = inputs[0];
    const output0 = outputs[0];
    const inputChannel = input0[0];
    const outputChannel = output0[0];
    
    if(typeof inputChannel === 'undefined') {
      return true;
    }
       
    for(var k = 0; k < inputChannel.length; ++k) {
    
      sample = inputChannel[k];
      
      filtered = a0 * (sample - this.z1) + b1 * this.p1;
      
      this.z1 = sample;
      this.p1 = filtered;
        
      this.HF_Level = alpha * Math.abs(filtered) + (1.0 - alpha) * this.HF_Level;
      
      var absLevel = Math.abs(this.HF_Level);
        
      if(absLevel > HFthresholdLevel) {
      
            //drop lung gain in greater proportion to the HF noise
            reduceGain = (HFthresholdLevel / absLevel);
            reduceGain *= reduceGain;
        
            if(reduceGain < HFMaxGainReduction)
                reduceGain = HFMaxGainReduction;
        
            
      } else {
        reduceGain = 1.0;
      }
      
      
      outputChannel[k] = sample * reduceGain;
    }
  
    return true;
  } //process
  
  
  
} //LungNoiseGate

registerProcessor('lung-noise-gate', LungNoiseGate)

    
