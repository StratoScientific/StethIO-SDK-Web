const urlParams = new URLSearchParams(window.location.search);
const pcc_code = urlParams.get('code');
console.log('pcc_code', pcc_code);
localStorage.setItem('pcc_code', pcc_code);