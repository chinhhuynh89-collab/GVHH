// Nội dung biên tập tĩnh — 4 bảng tra cứu Hoá học kinh điển, KHÔNG lấy từ Firestore, KHÔNG do người
// dùng tạo ra. Dữ liệu đã đối chiếu nhiều nguồn (SGK Hoá 8/9/12, bảng thế điện cực chuẩn quốc tế)
// trước khi đưa vào — xem js/features/reference-tables.js để biết cách hiển thị.

const REF_TABLE_SECTIONS = [
  { id: 'solubility', icon: '🧪', label: 'Bảng tính tan' },
  { id: 'activity', icon: '⚡', label: 'Dãy hoạt động kim loại' },
  { id: 'electrode', icon: '🔋', label: 'Dãy điện hoá chuẩn' },
  { id: 'ionid', icon: '🔍', label: 'Nhận biết ion' }
];

// ---------- Bảng tính tan ----------
// t: tan, k: không tan, i: ít tan — ô không có trong SOLUBILITY_DATA nghĩa là hợp chất không tồn tại
// hoặc không bền trong nước (hiện dấu "–"). Hàng H⁺ thể hiện tính tan/tồn tại của axit tương ứng
// (VD "H-CO3" = H₂CO₃), không hoàn toàn cùng ý nghĩa "độ tan" như các cation kim loại khác.
const SOLUBILITY_CATIONS = [
  { id: 'H', label: 'H⁺' },
  { id: 'Li', label: 'Li⁺' },
  { id: 'K', label: 'K⁺' },
  { id: 'Na', label: 'Na⁺' },
  { id: 'NH4', label: 'NH₄⁺' },
  { id: 'Ag', label: 'Ag⁺' },
  { id: 'Mg', label: 'Mg²⁺' },
  { id: 'Ca', label: 'Ca²⁺' },
  { id: 'Ba', label: 'Ba²⁺' },
  { id: 'Zn', label: 'Zn²⁺' },
  { id: 'Pb', label: 'Pb²⁺' },
  { id: 'Cu', label: 'Cu²⁺' },
  { id: 'Fe2', label: 'Fe²⁺' },
  { id: 'Fe3', label: 'Fe³⁺' },
  { id: 'Al', label: 'Al³⁺' },
  { id: 'Mn', label: 'Mn²⁺' }
];
const SOLUBILITY_ANIONS = [
  { id: 'Cl', label: 'Cl⁻' },
  { id: 'Br', label: 'Br⁻' },
  { id: 'I', label: 'I⁻' },
  { id: 'NO3', label: 'NO₃⁻' },
  { id: 'CH3COO', label: 'CH₃COO⁻' },
  { id: 'SO4', label: 'SO₄²⁻' },
  { id: 'SO3', label: 'SO₃²⁻' },
  { id: 'S', label: 'S²⁻' },
  { id: 'CO3', label: 'CO₃²⁻' },
  { id: 'PO4', label: 'PO₄³⁻' },
  { id: 'OH', label: 'OH⁻' },
  { id: 'SiO3', label: 'SiO₃²⁻' }
];
const SOLUBILITY_DATA = {
  'H-Cl': 't', 'H-Br': 't', 'H-I': 't', 'H-NO3': 't', 'H-CH3COO': 't', 'H-SO4': 't', 'H-SO3': 't', 'H-S': 't', 'H-CO3': 't', 'H-PO4': 't', 'H-OH': 't', 'H-SiO3': 'k',
  'Li-Cl': 't', 'Li-Br': 't', 'Li-I': 't', 'Li-NO3': 't', 'Li-CH3COO': 't', 'Li-SO4': 't', 'Li-SO3': 't', 'Li-S': 't', 'Li-CO3': 't', 'Li-PO4': 'k', 'Li-OH': 't', 'Li-SiO3': 't',
  'K-Cl': 't', 'K-Br': 't', 'K-I': 't', 'K-NO3': 't', 'K-CH3COO': 't', 'K-SO4': 't', 'K-SO3': 't', 'K-S': 't', 'K-CO3': 't', 'K-PO4': 't', 'K-OH': 't', 'K-SiO3': 't',
  'Na-Cl': 't', 'Na-Br': 't', 'Na-I': 't', 'Na-NO3': 't', 'Na-CH3COO': 't', 'Na-SO4': 't', 'Na-SO3': 't', 'Na-S': 't', 'Na-CO3': 't', 'Na-PO4': 't', 'Na-OH': 't', 'Na-SiO3': 't',
  'NH4-Cl': 't', 'NH4-Br': 't', 'NH4-I': 't', 'NH4-NO3': 't', 'NH4-CH3COO': 't', 'NH4-SO4': 't', 'NH4-SO3': 't', 'NH4-S': 't', 'NH4-CO3': 't', 'NH4-PO4': 'k', 'NH4-OH': 't', 'NH4-SiO3': 't',
  'Ag-Cl': 'k', 'Ag-Br': 'k', 'Ag-I': 'k', 'Ag-NO3': 't', 'Ag-CH3COO': 't', 'Ag-SO4': 'i', 'Ag-SO3': 'k', 'Ag-S': 'k', 'Ag-CO3': 'k', 'Ag-PO4': 'k',
  'Mg-Cl': 't', 'Mg-Br': 't', 'Mg-I': 't', 'Mg-NO3': 't', 'Mg-CH3COO': 't', 'Mg-SO4': 't', 'Mg-SO3': 'k', 'Mg-CO3': 'k', 'Mg-PO4': 'k', 'Mg-OH': 'k', 'Mg-SiO3': 'k',
  'Ca-Cl': 't', 'Ca-Br': 't', 'Ca-I': 't', 'Ca-NO3': 't', 'Ca-CH3COO': 't', 'Ca-SO4': 'i', 'Ca-SO3': 'k', 'Ca-S': 't', 'Ca-CO3': 'k', 'Ca-PO4': 'k', 'Ca-OH': 'i', 'Ca-SiO3': 'k',
  'Ba-Cl': 't', 'Ba-Br': 't', 'Ba-I': 't', 'Ba-NO3': 't', 'Ba-CH3COO': 't', 'Ba-SO4': 'k', 'Ba-SO3': 'k', 'Ba-S': 't', 'Ba-CO3': 'k', 'Ba-PO4': 'k', 'Ba-OH': 't', 'Ba-SiO3': 'k',
  'Zn-Cl': 't', 'Zn-Br': 't', 'Zn-I': 't', 'Zn-NO3': 't', 'Zn-CH3COO': 't', 'Zn-SO4': 't', 'Zn-SO3': 'k', 'Zn-S': 'k', 'Zn-CO3': 'k', 'Zn-PO4': 'k', 'Zn-OH': 'k', 'Zn-SiO3': 'k',
  'Pb-Cl': 'i', 'Pb-Br': 'i', 'Pb-I': 'k', 'Pb-NO3': 't', 'Pb-CH3COO': 't', 'Pb-SO4': 'k', 'Pb-SO3': 'k', 'Pb-S': 'k', 'Pb-CO3': 'k', 'Pb-PO4': 'k', 'Pb-OH': 'k', 'Pb-SiO3': 'k',
  'Cu-Cl': 't', 'Cu-Br': 't', 'Cu-NO3': 't', 'Cu-CH3COO': 't', 'Cu-SO4': 't', 'Cu-SO3': 'k', 'Cu-S': 'k', 'Cu-PO4': 'k', 'Cu-OH': 'k',
  'Fe2-Cl': 't', 'Fe2-Br': 't', 'Fe2-I': 't', 'Fe2-NO3': 't', 'Fe2-CH3COO': 't', 'Fe2-SO4': 't', 'Fe2-SO3': 'k', 'Fe2-S': 'k', 'Fe2-CO3': 'k', 'Fe2-PO4': 'k', 'Fe2-OH': 'k', 'Fe2-SiO3': 'k',
  'Fe3-Cl': 't', 'Fe3-Br': 't', 'Fe3-NO3': 't', 'Fe3-SO4': 't', 'Fe3-S': 'k', 'Fe3-PO4': 'k', 'Fe3-OH': 'k', 'Fe3-SiO3': 'k',
  'Al-Cl': 't', 'Al-Br': 't', 'Al-I': 't', 'Al-NO3': 't', 'Al-CH3COO': 'i', 'Al-SO4': 't', 'Al-PO4': 'k', 'Al-OH': 'k', 'Al-SiO3': 'k',
  'Mn-Cl': 't', 'Mn-Br': 't', 'Mn-I': 'k', 'Mn-NO3': 't', 'Mn-CH3COO': 't', 'Mn-SO4': 't', 'Mn-SO3': 'k', 'Mn-S': 'k', 'Mn-CO3': 'k', 'Mn-PO4': 'k', 'Mn-OH': 'k', 'Mn-SiO3': 'k'
};

// ---------- Dãy hoạt động hoá học kim loại ----------
// Dãy 17 kim loại (+ mốc H) theo đúng SGK phổ thông — mạnh nhất bên trái, yếu dần sang phải.
const METAL_ACTIVITY_SERIES = [
  { symbol: 'K', name: 'Kali', note: 'Phản ứng rất mạnh với nước ở nhiệt độ thường, giải phóng khí H₂ và toả nhiều nhiệt.' },
  { symbol: 'Ba', name: 'Bari', note: 'Phản ứng mạnh với nước ở nhiệt độ thường.' },
  { symbol: 'Ca', name: 'Canxi', note: 'Phản ứng với nước ở nhiệt độ thường, tạo Ca(OH)₂ ít tan.' },
  { symbol: 'Na', name: 'Natri', note: 'Phản ứng mạnh với nước ở nhiệt độ thường.' },
  { symbol: 'Mg', name: 'Magie', note: 'Không phản ứng với nước lạnh (chỉ phản ứng với nước nóng/hơi nước); phản ứng mạnh với axit loãng.' },
  { symbol: 'Al', name: 'Nhôm', note: 'Có lớp oxit Al₂O₃ bền bảo vệ bề mặt; phản ứng được với cả axit và dung dịch kiềm (tính lưỡng tính).' },
  { symbol: 'Zn', name: 'Kẽm', note: 'Phản ứng với axit loãng giải phóng H₂; Zn(OH)₂ có tính lưỡng tính.' },
  { symbol: 'Fe', name: 'Sắt', note: 'Phản ứng với axit loãng giải phóng H₂; oxit sắt bị khử bởi H₂/CO ở nhiệt độ cao.' },
  { symbol: 'Ni', name: 'Niken', note: 'Phản ứng chậm với axit loãng.' },
  { symbol: 'Sn', name: 'Thiếc', note: 'Phản ứng chậm với axit loãng.' },
  { symbol: 'Pb', name: 'Chì', note: 'Phản ứng rất chậm với axit loãng do lớp muối khó tan bao phủ bề mặt.' },
  { symbol: 'H', name: 'Hiđro (không phải kim loại)', note: 'Mốc so sánh: kim loại đứng trước H đẩy được H₂ ra khỏi axit loãng (HCl, H₂SO₄ loãng); kim loại đứng sau H thì không.' },
  { symbol: 'Cu', name: 'Đồng', note: 'Không phản ứng với axit loãng; chỉ phản ứng với axit có tính oxi hoá mạnh (HNO₃, H₂SO₄ đặc nóng).' },
  { symbol: 'Hg', name: 'Thuỷ ngân', note: 'Không phản ứng với axit loãng; là kim loại duy nhất ở thể lỏng tại nhiệt độ thường.' },
  { symbol: 'Ag', name: 'Bạc', note: 'Không phản ứng với axit loãng; hoá đen khi tiếp xúc H₂S trong không khí (tạo Ag₂S).' },
  { symbol: 'Pt', name: 'Platin', note: 'Rất trơ về mặt hoá học, gần như không phản ứng với axit thường.' },
  { symbol: 'Au', name: 'Vàng', note: 'Kim loại kém hoạt động nhất trong dãy — chỉ tan trong nước cường toan (hỗn hợp HNO₃ và HCl đặc).' }
];

// ---------- Dãy điện hoá chuẩn (E°, 25°C, so với điện cực hiđro chuẩn) ----------
const ELECTRODE_POTENTIALS = [
  { halfReaction: 'Li⁺ + e⁻ ⇌ Li', e0: -3.04 },
  { halfReaction: 'K⁺ + e⁻ ⇌ K', e0: -2.93 },
  { halfReaction: 'Ba²⁺ + 2e⁻ ⇌ Ba', e0: -2.91 },
  { halfReaction: 'Ca²⁺ + 2e⁻ ⇌ Ca', e0: -2.87 },
  { halfReaction: 'Na⁺ + e⁻ ⇌ Na', e0: -2.71 },
  { halfReaction: 'Mg²⁺ + 2e⁻ ⇌ Mg', e0: -2.37 },
  { halfReaction: 'Al³⁺ + 3e⁻ ⇌ Al', e0: -1.66 },
  { halfReaction: 'Mn²⁺ + 2e⁻ ⇌ Mn', e0: -1.18 },
  { halfReaction: 'Zn²⁺ + 2e⁻ ⇌ Zn', e0: -0.76 },
  { halfReaction: 'Cr³⁺ + 3e⁻ ⇌ Cr', e0: -0.74 },
  { halfReaction: 'Fe²⁺ + 2e⁻ ⇌ Fe', e0: -0.44 },
  { halfReaction: 'Ni²⁺ + 2e⁻ ⇌ Ni', e0: -0.26 },
  { halfReaction: 'Sn²⁺ + 2e⁻ ⇌ Sn', e0: -0.14 },
  { halfReaction: 'Pb²⁺ + 2e⁻ ⇌ Pb', e0: -0.13 },
  { halfReaction: '2H⁺ + 2e⁻ ⇌ H₂', e0: 0.00 },
  { halfReaction: 'Cu²⁺ + 2e⁻ ⇌ Cu', e0: 0.34 },
  { halfReaction: 'Fe³⁺ + e⁻ ⇌ Fe²⁺', e0: 0.77 },
  { halfReaction: 'Ag⁺ + e⁻ ⇌ Ag', e0: 0.80 },
  { halfReaction: 'Hg²⁺ + 2e⁻ ⇌ Hg', e0: 0.85 },
  { halfReaction: 'Pt²⁺ + 2e⁻ ⇌ Pt', e0: 1.19 },
  { halfReaction: 'O₂ + 4H⁺ + 4e⁻ ⇌ 2H₂O', e0: 1.23 },
  { halfReaction: 'Cr₂O₇²⁻ + 14H⁺ + 6e⁻ ⇌ 2Cr³⁺ + 7H₂O', e0: 1.33 },
  { halfReaction: 'Cl₂ + 2e⁻ ⇌ 2Cl⁻', e0: 1.36 },
  { halfReaction: 'Au³⁺ + 3e⁻ ⇌ Au', e0: 1.50 },
  { halfReaction: 'MnO₄⁻ + 8H⁺ + 5e⁻ ⇌ Mn²⁺ + 4H₂O', e0: 1.51 },
  { halfReaction: 'F₂ + 2e⁻ ⇌ 2F⁻', e0: 2.87 }
];

// ---------- Bảng nhận biết ion ----------
const ION_IDENTIFICATION = [
  { ion: 'Na⁺', reagent: 'Đốt trên ngọn lửa không màu', phenomenon: 'Ngọn lửa nhuộm màu vàng tươi' },
  { ion: 'K⁺', reagent: 'Đốt trên ngọn lửa không màu', phenomenon: 'Ngọn lửa nhuộm màu tím' },
  { ion: 'NH₄⁺', reagent: 'Dung dịch NaOH/KOH, đun nhẹ', phenomenon: 'Khí mùi khai (NH₃) bay ra, làm xanh quỳ tím ẩm' },
  { ion: 'Ba²⁺', reagent: 'Dung dịch H₂SO₄ loãng (hoặc muối tan chứa SO₄²⁻)', phenomenon: 'Kết tủa trắng BaSO₄, không tan trong axit loãng' },
  { ion: 'Ca²⁺', reagent: 'Dung dịch chứa CO₃²⁻ (VD Na₂CO₃)', phenomenon: 'Kết tủa trắng CaCO₃, tan trong axit mạnh giải phóng khí CO₂' },
  { ion: 'Al³⁺', reagent: 'Dung dịch kiềm (NaOH/KOH), nhỏ từ từ đến dư', phenomenon: 'Kết tủa keo trắng Al(OH)₃ xuất hiện rồi tan trong kiềm dư (tính lưỡng tính)' },
  { ion: 'Zn²⁺', reagent: 'Dung dịch kiềm, nhỏ từ từ đến dư', phenomenon: 'Kết tủa trắng Zn(OH)₂ xuất hiện rồi tan trong kiềm dư (tính lưỡng tính)' },
  { ion: 'Fe²⁺', reagent: 'Dung dịch kiềm (OH⁻)', phenomenon: 'Kết tủa trắng hơi xanh Fe(OH)₂, hoá nâu đỏ ngoài không khí' },
  { ion: 'Fe³⁺', reagent: 'Dung dịch kiềm (OH⁻); hoặc dung dịch SCN⁻', phenomenon: 'Kết tủa nâu đỏ Fe(OH)₃; hoặc dung dịch chuyển đỏ máu với SCN⁻' },
  { ion: 'Cu²⁺', reagent: 'Dung dịch NH₃ dư', phenomenon: 'Kết tủa xanh lam Cu(OH)₂ rồi tan trong NH₃ dư, tạo dung dịch xanh lam đậm (phức chất)' },
  { ion: 'Mg²⁺', reagent: 'Dung dịch kiềm', phenomenon: 'Kết tủa trắng Mg(OH)₂, tan được trong dung dịch muối amoni' },
  { ion: 'H⁺', reagent: 'Quỳ tím', phenomenon: 'Quỳ tím hoá đỏ' },
  { ion: 'Cl⁻', reagent: 'Dung dịch AgNO₃', phenomenon: 'Kết tủa trắng AgCl, không tan trong axit, hoá đen ngoài ánh sáng' },
  { ion: 'Br⁻', reagent: 'Dung dịch AgNO₃', phenomenon: 'Kết tủa vàng nhạt AgBr, hoá đen ngoài ánh sáng' },
  { ion: 'I⁻', reagent: 'Dung dịch AgNO₃', phenomenon: 'Kết tủa vàng đậm AgI, không tan trong axit' },
  { ion: 'NO₃⁻', reagent: 'Bột Cu + dung dịch H₂SO₄ loãng, đun nhẹ', phenomenon: 'Dung dịch chuyển xanh (Cu²⁺); khí không màu (NO) hoá nâu (NO₂) ngoài không khí' },
  { ion: 'SO₄²⁻', reagent: 'Dung dịch BaCl₂ (trong môi trường axit loãng dư)', phenomenon: 'Kết tủa trắng BaSO₄, không tan trong axit loãng' },
  { ion: 'SO₃²⁻', reagent: 'Dung dịch I₂', phenomenon: 'Làm mất màu nâu đỏ của dung dịch I₂ (SO₃²⁻ bị oxi hoá thành SO₄²⁻)' },
  { ion: 'S²⁻', reagent: 'Dung dịch Pb(NO₃)₂ (hoặc CuSO₄)', phenomenon: 'Kết tủa đen PbS (hoặc CuS)' },
  { ion: 'CO₃²⁻ / HCO₃⁻', reagent: 'Dung dịch HCl hoặc H₂SO₄ loãng', phenomenon: 'Sủi bọt khí CO₂ không màu, làm đục nước vôi trong' },
  { ion: 'PO₄³⁻', reagent: 'Dung dịch AgNO₃', phenomenon: 'Kết tủa vàng Ag₃PO₄' },
  { ion: 'OH⁻', reagent: 'Quỳ tím / phenolphtalein', phenomenon: 'Quỳ tím hoá xanh; phenolphtalein hoá hồng' }
];
