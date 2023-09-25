
class LungAutoGain extends AudioWorkletProcessor {
  constructor() { 
    super(); 
    
    this.lungLevelDesired = 0.1; //what we want the average level to be
    this.lungHistoricalAverage = 0.01; //what the average level is (with initial level)
    this.sampleGain = 1.0; //The instantaneous gain (with initial gain)

  }
  
  //Adjust the gain based on average level over about 5 seconds.
  process (inputs, outputs, parameters) {
    const gProcessingSampleRate = 44100.0;
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
  
    return true;
  } //process
  
  
  
} //LungAutoGain

registerProcessor('lung-auto-gain', LungAutoGain)

    
