/**
 * excel-produk-parser.js -- Parser LOKAL (Node/Electron main process) untuk file Excel katalog
 * produk "Format Accurate" ("Daftar Barang dan Jasa"). Port PERSIS dari algoritma server
 * {@code KantinHelper.deteksiKolomExcelProdukFormatAccurate}/{@code produkImporExcelPreview}
 * (Java, lihat JavaDoc di sana) -- gap-closure permintaan user: "file excel dibaca di local
 * (android/desktop) saja, tidak perlu mengirimkan data ke server dulu, setelah proses simpan,
 * baru dikirimkan ke server". Menghilangkan ketergantungan pada server REDEPLOY untuk perbaikan
 * pembacaan Excel -- logika parsing sekarang hidup di kode klien (dipublikasikan lewat rilis
 * GitHub biasa), server HANYA disentuh saat "Simpan" (aksi {@code produk_impor_excel_komit},
 * TIDAK berubah -- tetap satu-satunya tempat penulisan database, upsert kategori/pemasok/satuan,
 * dan pencatatan StokOpname resmi).
 *
 * TIDAK melakukan deteksi per-kolom apa pun (sesuai permintaan eksplisit user) -- begitu baris
 * header ditemukan (baris yang punya sel PERSIS "Kode" DAN sel lain mengandung "Barcode"), field
 * dibaca dari POSISI ABSOLUT: C(2)=No, D(3)=Kode, E(4)=Barcode, F(5)=Kategori, G(6)=Nama Barang,
 * H(7)=Pemasok, I(8)=Satuan, J(9)=Kts (stok), K(10)=Def. Hrg. Jual Sa (harga jual), L(11)=Nilai
 * Satuan (harga beli). M(12)=Nilai Total SENGAJA tidak dibaca (dihitung ulang, bukan disimpan).
 */
const XLSX = require('xlsx');

function cellToText(v) {
    if (v === undefined || v === null) return '';
    if (typeof v === 'number') return String(v);
    return String(v).trim();
}

function parseAngkaAman(v) {
    const s = cellToText(v);
    if (!s) return 0;
    const bersih = s.replace(/,/g, '').replace(/[^0-9.\-]/g, '');
    if (!bersih || bersih === '-' || bersih === '.') return 0;
    const n = parseFloat(bersih);
    return isNaN(n) ? 0 : n;
}

/**
 * @param {Buffer} buffer isi berkas .xlsx
 * @return {{ok:boolean, pesan?:string, baris?:Array, kategoriDariFile?:string[], pemasokDariFile?:string[], satuanDariFile?:string[]}}
 */
function parseExcelProdukFormatAccurate(buffer) {
    let wb;
    try {
        wb = XLSX.read(buffer, { type: 'buffer' });
    } catch (e) {
        return { ok: false, pesan: 'File Excel tidak valid atau rusak: ' + (e && e.message ? e.message : e) };
    }
    const namaSheet = wb.SheetNames[0];
    if (!namaSheet) return { ok: false, pesan: 'File Excel tidak berisi sheet apa pun.' };
    const sheet = wb.Sheets[namaSheet];
    const rows2d = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });

    const batasBaris = Math.min(20, rows2d.length - 1);
    let barisHeader = -1;
    for (let r = 0; r <= batasBaris; r++) {
        const row = rows2d[r] || [];
        let adaKode = false, adaBarcode = false;
        for (let c = 0; c < row.length; c++) {
            const isi = cellToText(row[c]).toUpperCase();
            if (isi === 'KODE') adaKode = true;
            if (isi.indexOf('BARCODE') >= 0) adaBarcode = true;
        }
        if (adaKode && adaBarcode) { barisHeader = r; break; }
    }
    if (barisHeader < 0) {
        return { ok: false, pesan: 'Format Excel tidak dikenali -- baris header ("Kode" + "UPC/Barcode") tidak ditemukan di 20 baris pertama.' };
    }

    const KOL_NO = 2, KOL_KODE = 3, KOL_BARCODE = 4, KOL_KATEGORI = 5, KOL_NAMA = 6,
        KOL_PEMASOK = 7, KOL_SATUAN = 8, KOL_STOK = 9, KOL_HARGA_JUAL = 10, KOL_HARGA_BELI = 11;

    const baris = [];
    const setKategori = new Set(), setPemasok = new Set(), setSatuan = new Set();
    let no = 0;
    for (let r = barisHeader + 1; r < rows2d.length; r++) {
        const row = rows2d[r] || [];
        if (row.length === 0) continue;
        const noTeks = cellToText(row[KOL_NO]).toUpperCase();
        if (noTeks.indexOf('TOTAL') >= 0) break;
        const kode = cellToText(row[KOL_KODE]);
        const nama = cellToText(row[KOL_NAMA]);
        if (!kode || !nama) continue;
        no++;
        const barcode = cellToText(row[KOL_BARCODE]);
        const kategoriNama = cellToText(row[KOL_KATEGORI]);
        const pemasokNama = cellToText(row[KOL_PEMASOK]);
        const satuanNama = cellToText(row[KOL_SATUAN]);
        if (kategoriNama) setKategori.add(kategoriNama);
        if (pemasokNama) setPemasok.add(pemasokNama);
        if (satuanNama) setSatuan.add(satuanNama);
        baris.push({
            no, kode, barcode, nama, kategoriNama, pemasokNama, satuanNama,
            stokBaru: parseAngkaAman(row[KOL_STOK]),
            hargaJual: parseAngkaAman(row[KOL_HARGA_JUAL]),
            hargaBeli: parseAngkaAman(row[KOL_HARGA_BELI])
        });
    }

    return {
        ok: true,
        baris,
        kategoriDariFile: Array.from(setKategori).sort(),
        pemasokDariFile: Array.from(setPemasok).sort(),
        satuanDariFile: Array.from(setSatuan).sort()
    };
}

module.exports = { parseExcelProdukFormatAccurate };
