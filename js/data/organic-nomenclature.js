// Nội dung biên tập tĩnh — quy tắc gọi tên hoá học hữu cơ (danh pháp thay thế IUPAC, chương trình
// THPT), KHÔNG lấy từ Firestore, KHÔNG do người dùng tạo ra.
// Xem js/features/organic-nomenclature.js để biết cách hiển thị.

const NOMENCLATURE_SECTIONS = [
  { id: 'carbon-prefix', icon: '🔢', label: 'Tiền tố mạch cacbon' },
  { id: 'suffix', icon: '🏷️', label: 'Hậu tố nhóm chức' },
  { id: 'alkyl', icon: '🌿', label: 'Tên gốc ankyl' },
  { id: 'rules', icon: '📏', label: 'Các bước gọi tên' },
  { id: 'examples', icon: '✅', label: 'Ví dụ minh hoạ' }
];

// ---------- Tiền tố chỉ số nguyên tử cacbon mạch chính ----------
const CARBON_PREFIXES = [
  { count: 1, prefix: 'Met' }, { count: 2, prefix: 'Et' }, { count: 3, prefix: 'Prop' },
  { count: 4, prefix: 'But' }, { count: 5, prefix: 'Pent' }, { count: 6, prefix: 'Hex' },
  { count: 7, prefix: 'Hept' }, { count: 8, prefix: 'Oct' }, { count: 9, prefix: 'Non' },
  { count: 10, prefix: 'Đec' }
];

// ---------- Hậu tố theo loại hiđrocacbon / nhóm chức ----------
const FUNCTIONAL_SUFFIXES = [
  { className: 'Ankan (no, mạch hở)', suffix: '-an', example: 'metan, etan, propan' },
  { className: 'Anken (1 liên kết đôi C=C)', suffix: '-en', example: 'eten (etilen), propen' },
  { className: 'Ankin (1 liên kết ba C≡C)', suffix: '-in', example: 'etin (axetilen), propin' },
  { className: 'Ankadien (2 liên kết đôi C=C)', suffix: '-ađien', example: 'buta-1,3-đien' },
  { className: 'Ancol (rượu, -OH)', suffix: '-ol', example: 'metanol, etanol' },
  { className: 'Anđehit (-CHO)', suffix: '-al', example: 'metanal (fomanđehit), etanal' },
  { className: 'Xeton (>C=O mạch giữa)', suffix: '-on', example: 'propan-2-on (axeton)' },
  { className: 'Axit cacboxylic (-COOH)', suffix: 'axit ...-oic', example: 'axit metanoic (axit fomic), axit etanoic (axit axetic)' },
  { className: 'Este (-COO-)', suffix: 'tên gốc + ...-oat', example: 'metyl axetat, etyl fomat' },
  { className: 'Amin (-NH₂)', suffix: '-amin', example: 'metylamin, etylamin' }
];

// ---------- Tên gốc hiđrocacbon (ankyl) ----------
const ALKYL_GROUPS = [
  { formula: '-CH₃', name: 'metyl' },
  { formula: '-C₂H₅', name: 'etyl' },
  { formula: '-CH₂-CH₂-CH₃', name: 'propyl (n-propyl)' },
  { formula: '-CH(CH₃)₂', name: 'isopropyl' },
  { formula: '-CH₂-CH₂-CH₂-CH₃', name: 'butyl (n-butyl)' },
  { formula: '-CH(CH₃)-CH₂-CH₃', name: 'sec-butyl' },
  { formula: '-CH₂-CH(CH₃)₂', name: 'isobutyl' },
  { formula: '-C(CH₃)₃', name: 'tert-butyl' },
  { formula: '-C₆H₅', name: 'phenyl (gốc thơm từ benzen)' }
];

// ---------- Các bước gọi tên thay thế (danh pháp IUPAC cơ bản) ----------
const NAMING_STEPS = [
  { step: 1, title: 'Chọn mạch chính', detail: 'Mạch cacbon dài nhất, chứa nhóm chức chính (nếu có); nếu có nhiều mạch dài bằng nhau, chọn mạch có nhiều nhánh nhất.' },
  { step: 2, title: 'Đánh số mạch chính', detail: 'Đánh số sao cho tổng vị trí các nhóm thế + nhóm chức là nhỏ nhất; nhóm chức chính luôn được ưu tiên mang số nhỏ nhất.' },
  { step: 3, title: 'Gọi tên nhánh (nhóm thế)', detail: 'Ghi số chỉ vị trí + tên gốc ankyl của từng nhánh, xếp theo thứ tự chữ cái nếu có nhiều nhánh khác nhau; nhánh giống nhau dùng tiền tố đi/tri/tetra... và cộng gộp vị trí.' },
  { step: 4, title: 'Ghép tên', detail: 'Tên = (vị trí-tên nhánh) + tên mạch chính (tiền tố số C + hậu tố loại hợp chất), thêm số chỉ vị trí nhóm chức/liên kết bội nếu mạch từ 4C trở lên.' },
  { step: 5, title: 'Tên thông thường (tên bán hệ thống)', detail: 'Một số chất có tên quen dùng song song với tên IUPAC (axit fomic = axit metanoic, axeton = propan-2-on, axetilen = etin) — SGK thường chấp nhận cả hai.' }
];

// ---------- Ví dụ minh hoạ ----------
const NOMENCLATURE_EXAMPLES = [
  { formula: 'CH₄', name: 'Metan' },
  { formula: 'CH₃-CH₃', name: 'Etan' },
  { formula: 'CH₃-CH₂-CH₃', name: 'Propan' },
  { formula: 'CH₃-CH(CH₃)-CH₃', name: '2-metylpropan (isobutan)' },
  { formula: 'CH₂=CH₂', name: 'Eten (etilen)' },
  { formula: 'CH₂=CH-CH₃', name: 'Propen' },
  { formula: 'CH≡CH', name: 'Etin (axetilen)' },
  { formula: 'CH₃-CH₂-OH', name: 'Etanol (ancol etylic)' },
  { formula: 'CH₃-OH', name: 'Metanol (ancol metylic)' },
  { formula: 'CH₃-CHO', name: 'Etanal (anđehit axetic)' },
  { formula: 'CH₃-CO-CH₃', name: 'Propan-2-on (axeton)' },
  { formula: 'HCOOH', name: 'Axit metanoic (axit fomic)' },
  { formula: 'CH₃-COOH', name: 'Axit etanoic (axit axetic)' },
  { formula: 'CH₃-COO-CH₃', name: 'Metyl axetat' },
  { formula: 'CH₃-NH₂', name: 'Metylamin' },
  { formula: 'C₆H₆', name: 'Benzen' }
];
