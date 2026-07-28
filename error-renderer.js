/**
 * error-renderer.js -- Logika halaman fallback error.html. Dimuat di JENDELA POS UTAMA yang sama
 * (bukan jendela terpisah), sehingga memakai window.electronAPI dari preload.js -- BUKAN preload
 * khusus tersendiri seperti setup.html/setup-renderer.js.
 */
(function () {
    const params = new URLSearchParams(window.location.search);
    const target = params.get('url') || '-';
    const pesan = params.get('pesan') || '';

    document.getElementById('targetUrl').textContent = target;
    if (pesan) document.getElementById('detail').textContent = 'Rincian teknis: ' + pesan;

    document.getElementById('btnRetry').addEventListener('click', () => {
        window.electronAPI.retryConnection();
    });
    document.getElementById('btnSetup').addEventListener('click', () => {
        window.electronAPI.openSetupFromError();
    });
})();
