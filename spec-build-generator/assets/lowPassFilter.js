export function lowPassFilter(samples, cutoff, sampleRate, last_val) {
    let rc = 1.0 / (cutoff * 2 * Math.PI);
    let dt = 1.0 / sampleRate;
    let alpha = dt / (rc + dt);
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
    return last_val;
}