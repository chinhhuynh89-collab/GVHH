// Lớp 9 — mạch Hoá học trong môn Khoa học tự nhiên (KHTN), chương trình GDPT 2018. 4 chương đầy đủ nội dung chi tiết.

const CHAPTERS_9 = [
  {
    id: 'c9-1',
    order: 1,
    title: 'Kim loại — Dãy hoạt động hoá học',
    icon: '🔩',
    description: 'Tính chất chung của kim loại, dãy hoạt động hoá học và ý nghĩa, hợp kim',
    lessons: [
      {
        title: 'Bài 1. Tính chất chung của kim loại',
        points: [
          'Tính chất vật lí chung: dẫn điện, dẫn nhiệt tốt, có ánh kim, có tính dẻo (dễ dát mỏng, kéo sợi); phần lớn ở thể rắn (trừ thuỷ ngân ở thể lỏng).',
          'Tác dụng với phi kim: nhiều kim loại tác dụng với oxygen tạo oxide (VD: 3Fe + 2O2 →(to) Fe3O4); tác dụng với chlorine, sulfur tạo muối.',
          'Tác dụng với dung dịch acid (HCl, H2SO4 loãng): kim loại đứng trước hydrogen trong dãy hoạt động giải phóng khí H2 (VD: Fe + 2HCl → FeCl2 + H2).',
          'Tác dụng với dung dịch muối: kim loại hoạt động mạnh hơn đẩy được kim loại yếu hơn ra khỏi dung dịch muối của nó (VD: Fe + CuSO4 → FeSO4 + Cu).'
        ]
      },
      {
        title: 'Bài 2. Dãy hoạt động hoá học của kim loại',
        points: [
          'Dãy hoạt động hoá học (mức độ hoạt động giảm dần): K, Na, Ca, Mg, Al, Zn, Fe, Pb, (H), Cu, Ag, Au.',
          'Ý nghĩa: kim loại đứng trước Mg phản ứng được với nước ở nhiệt độ thường, giải phóng khí H2.',
          'Kim loại đứng trước hydrogen (H) trong dãy phản ứng được với dung dịch acid loãng, giải phóng khí H2; kim loại đứng sau H (Cu, Ag, Au) thì không.',
          'Kim loại đứng trước (trong dãy) đẩy được kim loại đứng sau ra khỏi dung dịch muối của kim loại đó.'
        ]
      },
      {
        title: 'Bài 3. Hợp kim',
        points: [
          'Hợp kim là vật liệu kim loại có chứa một kim loại cơ bản và một số kim loại hoặc phi kim khác.',
          'Gang và thép đều là hợp kim của sắt với carbon: gang có hàm lượng carbon cao hơn (cứng, giòn); thép có hàm lượng carbon thấp hơn (dẻo dai, bền hơn, dễ gia công).',
          'Hợp kim thường có độ cứng, độ bền cơ học cao hơn kim loại nguyên chất tạo thành nó.'
        ]
      }
    ],
    flashcards: [
      { front: 'Tính chất vật lí chung của kim loại', back: 'Dẫn điện, dẫn nhiệt tốt, có ánh kim, có tính dẻo (trừ thuỷ ngân ở thể lỏng)' },
      { front: 'Kim loại tác dụng với dung dịch acid tạo ra', back: 'Muối và khí hydrogen (H2) — với kim loại đứng trước H trong dãy hoạt động' },
      { front: 'Dãy hoạt động hoá học của kim loại', back: 'K, Na, Ca, Mg, Al, Zn, Fe, Pb, (H), Cu, Ag, Au (giảm dần độ hoạt động)' },
      { front: 'Kim loại đứng trước H trong dãy hoạt động', back: 'Đẩy được H ra khỏi dung dịch acid, giải phóng khí H2' },
      { front: 'Kim loại đứng trước Mg trong dãy hoạt động', back: 'Phản ứng được với nước ở nhiệt độ thường' },
      { front: 'Phản ứng kim loại đẩy kim loại', back: 'Kim loại mạnh hơn đẩy kim loại yếu hơn ra khỏi dung dịch muối (VD: Fe + CuSO4)' },
      { front: 'Hợp kim', back: 'Vật liệu kim loại chứa một kim loại cơ bản và một số kim loại/phi kim khác' },
      { front: 'Gang', back: 'Hợp kim của sắt với carbon, hàm lượng carbon cao hơn thép, cứng và giòn' },
      { front: 'Thép', back: 'Hợp kim của sắt với carbon, hàm lượng carbon thấp hơn gang, dẻo dai và bền' },
      { front: 'Kim loại nào ở thể lỏng tại nhiệt độ thường', back: 'Thuỷ ngân (Hg)' }
    ],
    quiz: [
      { q: 'Tính chất vật lí nào KHÔNG phải là tính chất chung của kim loại?', options: ['Dẫn điện', 'Dẫn nhiệt', 'Có ánh kim', 'Giòn, dễ vỡ'], correct: 3, explain: 'Kim loại có tính dẻo (dễ dát mỏng, kéo sợi), không giòn như phần lớn phi kim.' },
      { q: 'Kim loại nào sau đây phản ứng được với nước ở nhiệt độ thường?', options: ['Fe', 'Cu', 'Na', 'Ag'], correct: 2, explain: 'Na đứng trước Mg trong dãy hoạt động nên phản ứng được với nước ở nhiệt độ thường.' },
      { q: 'Kim loại nào sau đây KHÔNG phản ứng với dung dịch HCl loãng?', options: ['Fe', 'Zn', 'Cu', 'Al'], correct: 2, explain: 'Cu đứng sau H trong dãy hoạt động nên không đẩy được H ra khỏi acid.' },
      { q: 'Trong phản ứng Fe + CuSO4 → FeSO4 + Cu, vai trò của Fe là:', options: ['Bị khử', 'Kim loại yếu hơn Cu', 'Đẩy Cu ra khỏi dung dịch muối', 'Không phản ứng'], correct: 2, explain: 'Fe hoạt động mạnh hơn Cu nên đẩy được Cu ra khỏi dung dịch muối CuSO4.' },
      { q: 'Hợp kim của sắt với carbon có hàm lượng carbon cao, cứng và giòn là:', options: ['Thép', 'Gang', 'Đồng thau', 'Inox'], correct: 1, explain: 'Gang có hàm lượng carbon cao hơn thép nên cứng nhưng giòn hơn.' },
      { q: 'Dãy kim loại nào được sắp xếp đúng theo chiều giảm dần hoạt động hoá học?', options: ['Ag, Cu, Fe, K', 'K, Na, Fe, Cu', 'Cu, Fe, Na, K', 'Fe, K, Na, Cu'], correct: 1, explain: 'Theo dãy hoạt động: K > Na > ... > Fe > ... > Cu, đúng thứ tự giảm dần.' },
      { q: 'Kim loại nào có tính dẻo cao, thường dùng để dát vàng?', options: ['Sắt', 'Vàng', 'Kẽm', 'Chì'], correct: 1, explain: 'Vàng (Au) có tính dẻo rất cao, có thể dát thành lá cực mỏng.' },
      { q: 'Thép khác gang chủ yếu ở điểm nào?', options: ['Thép không chứa carbon', 'Thép có hàm lượng carbon thấp hơn gang', 'Thép không phải hợp kim của sắt', 'Thép cứng và giòn hơn gang'], correct: 1, explain: 'Hàm lượng carbon thấp hơn giúp thép dẻo dai và dễ gia công hơn gang.' }
    ]
  },
  {
    id: 'c9-2',
    order: 2,
    title: 'Phi kim — Bảng tuần hoàn các nguyên tố hoá học',
    icon: '🧪',
    description: 'Tính chất chung của phi kim; ôn tập và mở rộng bảng tuần hoàn',
    lessons: [
      {
        title: 'Bài 4. Tính chất chung của phi kim',
        points: [
          'Tính chất vật lí: phần lớn không dẫn điện, dẫn nhiệt kém (trừ than chì dẫn điện được); tồn tại ở cả 3 thể (khí: O2, N2, Cl2; lỏng: Br2; rắn: S, P, C, I2).',
          'Tác dụng với kim loại tạo muối hoặc oxide (VD: Cl2 + 2Na →(to) 2NaCl).',
          'Tác dụng với hydrogen tạo hợp chất khí (VD: H2 + Cl2 →(as) 2HCl).',
          'Tác dụng với oxygen tạo oxide acid (VD: S + O2 →(to) SO2).',
          'Mức độ hoạt động hoá học của phi kim được đánh giá qua khả năng phản ứng với kim loại và hydrogen; fluorine, oxygen, chlorine là những phi kim có tính oxi hoá mạnh.'
        ]
      },
      {
        title: 'Bài 5. Bảng tuần hoàn các nguyên tố hoá học (mở rộng)',
        points: [
          'Ôn tập: ô nguyên tố (số hiệu nguyên tử, kí hiệu, tên nguyên tố, nguyên tử khối), chu kỳ (hàng ngang), nhóm (cột dọc).',
          'Trong 1 chu kỳ, đi từ trái sang phải: tính kim loại giảm dần, tính phi kim tăng dần.',
          'Trong 1 nhóm, đi từ trên xuống dưới: tính kim loại tăng dần, tính phi kim giảm dần (ở các nhóm A).',
          'Bảng tuần hoàn giúp dự đoán và giải thích tính chất của nguyên tố dựa vào vị trí của nó, ứng dụng trong việc lựa chọn vật liệu phù hợp.'
        ]
      }
    ],
    flashcards: [
      { front: 'Tính chất vật lí chung của phi kim', back: 'Không dẫn điện (trừ than chì), dẫn nhiệt kém, tồn tại ở cả 3 thể rắn/lỏng/khí' },
      { front: 'Phi kim + kim loại tạo ra', back: 'Muối hoặc oxide' },
      { front: 'Phi kim + hydrogen tạo ra', back: 'Hợp chất khí (VD: HCl, H2S)' },
      { front: 'Phi kim + oxygen tạo ra', back: 'Oxide acid (VD: SO2, CO2)' },
      { front: 'Phi kim có tính oxi hoá mạnh nhất', back: 'Fluorine (F)' },
      { front: 'Than chì có tính chất đặc biệt gì so với phi kim khác', back: 'Dẫn điện được, dù bản chất là phi kim' },
      { front: 'Ví dụ phi kim ở thể lỏng', back: 'Bromine (Br2)' },
      { front: 'Ví dụ phi kim ở thể khí', back: 'Oxygen (O2), Nitrogen (N2), Chlorine (Cl2)' },
      { front: 'Trong 1 chu kỳ (trái → phải), tính phi kim', back: 'Tăng dần' },
      { front: 'Trong 1 nhóm A (trên → dưới), tính phi kim', back: 'Giảm dần' }
    ],
    quiz: [
      { q: 'Phi kim nào sau đây dẫn điện được — đặc biệt so với các phi kim khác?', options: ['Lưu huỳnh', 'Than chì', 'Photpho', 'Iot'], correct: 1, explain: 'Than chì (1 dạng thù hình của carbon) có cấu trúc lớp đặc biệt cho phép dẫn điện.' },
      { q: 'Phản ứng nào sau đây tạo ra oxide acid?', options: ['S + O2 → SO2', 'Na + Cl2 → NaCl', 'Fe + S → FeS', 'H2 + Cl2 → HCl'], correct: 0, explain: 'Phi kim tác dụng với oxygen tạo oxide acid, ví dụ SO2.' },
      { q: 'Phi kim nào có tính oxi hoá mạnh nhất trong các phi kim?', options: ['Oxygen', 'Chlorine', 'Fluorine', 'Sulfur'], correct: 2, explain: 'Fluorine có độ âm điện lớn nhất, tính oxi hoá mạnh nhất trong tất cả các nguyên tố.' },
      { q: 'Ở điều kiện thường, phi kim nào tồn tại ở thể lỏng?', options: ['Chlorine', 'Bromine', 'Iodine', 'Sulfur'], correct: 1, explain: 'Bromine là phi kim duy nhất ở thể lỏng tại nhiệt độ phòng.' },
      { q: 'Phản ứng giữa phi kim và kim loại thường tạo ra sản phẩm là:', options: ['Acid', 'Base', 'Muối hoặc oxide', 'Khí hydrogen'], correct: 2, explain: 'Kim loại + phi kim thường tạo muối (VD: NaCl) hoặc oxide (VD: Fe3O4).' },
      { q: 'Trong bảng tuần hoàn, các nguyên tố cùng 1 nhóm có đặc điểm gì?', options: ['Cùng số lớp electron', 'Tính chất hoá học tương tự nhau', 'Cùng khối lượng nguyên tử', 'Cùng trạng thái tồn tại'], correct: 1, explain: 'Các nguyên tố cùng nhóm có cấu hình electron lớp ngoài cùng tương tự nên tính chất hoá học tương tự nhau.' },
      { q: 'Nguyên tố phi kim nào phổ biến nhất trong khí quyển Trái Đất?', options: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen'], correct: 1, explain: 'Nitrogen (N2) chiếm khoảng 78% thể tích khí quyển.' },
      { q: 'Phản ứng H2 + Cl2 → 2HCl thể hiện tính chất nào của phi kim chlorine?', options: ['Tác dụng với kim loại', 'Tác dụng với hydrogen', 'Tác dụng với oxygen', 'Tác dụng với nước'], correct: 1, explain: 'Đây là phản ứng giữa phi kim chlorine và hydrogen, tạo hợp chất khí HCl.' }
    ]
  },
  {
    id: 'c9-3',
    order: 3,
    title: 'Hợp chất hữu cơ — Hydrocarbon',
    icon: '🛢️',
    description: 'Khái niệm hợp chất hữu cơ, alkane (methane), alkene (ethylene)',
    lessons: [
      {
        title: 'Bài 6. Khái niệm về hợp chất hữu cơ',
        points: [
          'Hợp chất hữu cơ là hợp chất của carbon (trừ CO, CO2, muối carbonate, cyanide… được xem là hợp chất vô cơ đơn giản của carbon).',
          'Hoá học hữu cơ là ngành hoá học nghiên cứu về hợp chất hữu cơ.',
          'Đặc điểm chung: liên kết chủ yếu là liên kết cộng hoá trị, thường dễ cháy, kém bền với nhiệt hơn nhiều hợp chất vô cơ.',
          'Phân loại: hydrocarbon (chỉ chứa C và H) và dẫn xuất của hydrocarbon (chứa thêm O, N, Cl…).'
        ]
      },
      {
        title: 'Bài 7. Alkane — đại diện methane (CH4)',
        points: [
          'Alkane là hydrocarbon no, mạch hở, chỉ có liên kết đơn C–C và C–H. Công thức chung: CnH2n+2.',
          'Methane (CH4): khí không màu, không mùi, nhẹ hơn không khí, ít tan trong nước, dễ cháy — là thành phần chính của khí thiên nhiên và khí biogas.',
          'Phản ứng đặc trưng của alkane: phản ứng cháy (toả nhiều nhiệt) và phản ứng thế với chlorine khi có ánh sáng.'
        ]
      },
      {
        title: 'Bài 8. Alkene — đại diện ethylene (C2H4)',
        points: [
          'Alkene là hydrocarbon không no, mạch hở, có 1 liên kết đôi C=C. Công thức chung: CnH2n.',
          'Ethylene (C2H4, còn gọi ethene): khí không màu, là nguyên liệu quan trọng để sản xuất polyethylene (nhựa PE); có khả năng kích thích quả mau chín.',
          'Phản ứng đặc trưng của alkene: phản ứng cộng (làm mất màu dung dịch bromine — dùng để phân biệt với alkane) và phản ứng trùng hợp tạo polymer.'
        ]
      }
    ],
    flashcards: [
      { front: 'Hợp chất hữu cơ', back: 'Hợp chất của carbon (trừ CO, CO2, muối carbonate…)' },
      { front: 'Hydrocarbon', back: 'Hợp chất hữu cơ chỉ chứa 2 nguyên tố carbon và hydrogen' },
      { front: 'Alkane', back: 'Hydrocarbon no, mạch hở, chỉ có liên kết đơn, công thức chung CnH2n+2' },
      { front: 'Alkene', back: 'Hydrocarbon không no, mạch hở, có 1 liên kết đôi C=C, công thức chung CnH2n' },
      { front: 'Methane (CH4)', back: 'Khí không màu, không mùi, thành phần chính của khí thiên nhiên và khí biogas' },
      { front: 'Ethylene (C2H4)', back: 'Khí không màu, nguyên liệu sản xuất nhựa PE, kích thích quả mau chín' },
      { front: 'Phản ứng đặc trưng của alkane', back: 'Phản ứng cháy và phản ứng thế (với chlorine khi có ánh sáng)' },
      { front: 'Phản ứng đặc trưng của alkene', back: 'Phản ứng cộng (làm mất màu dung dịch bromine) và phản ứng trùng hợp' },
      { front: 'Cách phân biệt alkane và alkene đơn giản', back: 'Dùng dung dịch bromine: alkene làm mất màu, alkane thì không' },
      { front: 'Phản ứng trùng hợp', back: 'Nhiều phân tử nhỏ (monome) kết hợp tạo thành phân tử lớn (polymer)' }
    ],
    quiz: [
      { q: 'Hợp chất hữu cơ là hợp chất của nguyên tố nào?', options: ['Oxygen', 'Carbon', 'Nitrogen', 'Hydrogen'], correct: 1, explain: 'Hợp chất hữu cơ được định nghĩa là hợp chất của carbon (trừ một số hợp chất vô cơ đơn giản).' },
      { q: 'Công thức chung của alkane là:', options: ['CnH2n', 'CnH2n+2', 'CnH2n−2', 'CnHn'], correct: 1, explain: 'Alkane là hydrocarbon no với công thức chung CnH2n+2.' },
      { q: 'Khí nào là thành phần chính của khí thiên nhiên?', options: ['Ethylene', 'Methane', 'Acetylene', 'Carbon dioxide'], correct: 1, explain: 'Methane (CH4) chiếm phần lớn thành phần của khí thiên nhiên.' },
      { q: 'Alkene có đặc điểm cấu tạo nào khác với alkane?', options: ['Có liên kết đôi C=C', 'Chỉ có liên kết đơn', 'Không chứa hydrogen', 'Có mạch vòng'], correct: 0, explain: 'Alkene là hydrocarbon không no với 1 liên kết đôi C=C trong phân tử.' },
      { q: 'Để phân biệt alkane và alkene, người ta thường dùng:', options: ['Dung dịch NaOH', 'Dung dịch bromine', 'Nước cất', 'Giấy quỳ tím'], correct: 1, explain: 'Alkene làm mất màu dung dịch bromine do phản ứng cộng, còn alkane thì không phản ứng.' },
      { q: 'Ethylene được dùng làm nguyên liệu chủ yếu để sản xuất:', options: ['Xà phòng', 'Nhựa PE (polyethylene)', 'Phân bón', 'Thuỷ tinh'], correct: 1, explain: 'Ethylene trùng hợp tạo thành polyethylene (nhựa PE), vật liệu nhựa phổ biến nhất.' },
      { q: 'Phản ứng trùng hợp là:', options: ['Phản ứng cháy tạo CO2 và H2O', 'Nhiều phân tử nhỏ kết hợp tạo phân tử lớn (polymer)', 'Phản ứng thế nguyên tử H', 'Phản ứng giữa acid và base'], correct: 1, explain: 'Trùng hợp là quá trình các monome liên kết với nhau tạo thành mạch polymer dài.' },
      { q: 'Alkane tham gia phản ứng thế với chlorine trong điều kiện nào?', options: ['Có mặt nước', 'Có ánh sáng', 'Đun sôi trong acid', 'Có chất xúc tác base'], correct: 1, explain: 'Phản ứng thế giữa alkane và chlorine cần có ánh sáng để khơi mào.' }
    ]
  },
  {
    id: 'c9-4',
    order: 4,
    title: 'Dẫn xuất hydrocarbon',
    icon: '🍬',
    description: 'Ethanol, acetic acid, glucose, saccharose và khái niệm polymer',
    lessons: [
      {
        title: 'Bài 9. Ethanol (C2H5OH)',
        points: [
          'Là chất lỏng không màu, mùi thơm đặc trưng, tan vô hạn trong nước, dễ cháy.',
          'Điều chế: lên men tinh bột hoặc đường nhờ men rượu (glucose → ethanol + carbon dioxide).',
          'Ứng dụng: pha chế đồ uống có cồn (kiểm soát nồng độ), sát khuẩn y tế, dung môi công nghiệp, nhiên liệu sinh học (xăng E5).',
          'Lạm dụng ethanol (rượu, bia) gây hại cho gan, hệ thần kinh và có thể gây nghiện.'
        ]
      },
      {
        title: 'Bài 10. Acetic acid (CH3COOH) — giấm ăn',
        points: [
          'Là chất lỏng không màu, mùi chua đặc trưng; giấm ăn là dung dịch acetic acid nồng độ khoảng 2–5%.',
          'Là một acid hữu cơ yếu: làm quỳ tím hoá đỏ, tác dụng được với kim loại đứng trước hydrogen, với base, oxide base và muối carbonate.',
          'Điều chế: lên men ethanol nhờ vi khuẩn giấm (ethanol + oxygen → acetic acid + nước).',
          'Ứng dụng: làm giấm ăn, sản xuất tơ nhân tạo, dược phẩm, chất dẻo.'
        ]
      },
      {
        title: 'Bài 11. Glucose và saccharose',
        points: [
          'Glucose (C6H12O6): đường đơn, có trong quả chín, mật ong và là đường có trong máu người; vị ngọt, tan tốt trong nước.',
          'Saccharose (đường mía, C12H22O11): đường đôi, là thành phần chính của đường ăn; khi thuỷ phân tạo ra glucose và fructose.',
          'Vai trò: cung cấp năng lượng cho cơ thể thông qua quá trình hô hấp tế bào.'
        ]
      },
      {
        title: 'Bài 12. Polymer (khái niệm sơ lược)',
        points: [
          'Polymer là hợp chất có phân tử khối rất lớn, được tạo bởi nhiều mắt xích (monome) liên kết với nhau.',
          'Polymer thiên nhiên: tinh bột, cellulose. Polymer tổng hợp: PE (polyethylene), PVC.',
          'Polymer được ứng dụng rộng rãi trong bao bì, đồ gia dụng, sợi dệt, vật liệu xây dựng — cần có ý thức phân loại và tái chế để bảo vệ môi trường.'
        ]
      }
    ],
    flashcards: [
      { front: 'Ethanol (C2H5OH)', back: 'Chất lỏng không màu, mùi thơm, tan vô hạn trong nước, dễ cháy' },
      { front: 'Điều chế ethanol', back: 'Lên men tinh bột/đường (glucose → ethanol + CO2) nhờ men rượu' },
      { front: 'Acetic acid (CH3COOH)', back: 'Có trong giấm ăn, là acid hữu cơ yếu, mùi chua đặc trưng' },
      { front: 'Điều chế acetic acid', back: 'Lên men ethanol nhờ vi khuẩn giấm (ethanol + O2 → acetic acid + nước)' },
      { front: 'Glucose', back: 'Đường đơn (C6H12O6), có trong quả chín, mật ong, là đường trong máu người' },
      { front: 'Saccharose', back: 'Đường đôi (C12H22O11), thành phần chính đường mía/đường ăn' },
      { front: 'Thuỷ phân saccharose tạo ra', back: 'Glucose và fructose' },
      { front: 'Polymer', back: 'Hợp chất phân tử khối rất lớn, tạo bởi nhiều mắt xích (monome) liên kết với nhau' },
      { front: 'Polymer thiên nhiên', back: 'Tinh bột, cellulose' },
      { front: 'Polymer tổng hợp', back: 'PE (polyethylene), PVC' }
    ],
    quiz: [
      { q: 'Ethanol có công thức hoá học là:', options: ['CH3COOH', 'C2H5OH', 'C6H12O6', 'CH4'], correct: 1, explain: 'Ethanol (rượu ethylic) có công thức C2H5OH.' },
      { q: 'Giấm ăn là dung dịch của chất nào?', options: ['Ethanol', 'Acetic acid', 'Glucose', 'Saccharose'], correct: 1, explain: 'Giấm ăn là dung dịch acetic acid nồng độ khoảng 2–5%.' },
      { q: 'Ethanol được điều chế phổ biến bằng cách nào?', options: ['Lên men tinh bột/đường', 'Nung đá vôi', 'Điện phân nước', 'Đốt cháy methane'], correct: 0, explain: 'Ethanol thường được sản xuất bằng cách lên men tinh bột hoặc đường nhờ men rượu.' },
      { q: 'Acetic acid được điều chế bằng cách nào?', options: ['Lên men ethanol nhờ vi khuẩn giấm', 'Đun nóng glucose', 'Cô cạn nước biển', 'Nung đá vôi'], correct: 0, explain: 'Vi khuẩn giấm oxi hoá ethanol trong không khí tạo thành acetic acid.' },
      { q: 'Thuỷ phân saccharose tạo ra 2 loại đường nào?', options: ['Glucose và fructose', 'Glucose và tinh bột', 'Fructose và cellulose', 'Glucose và saccharose'], correct: 0, explain: 'Saccharose là đường đôi, thuỷ phân cho ra 2 đường đơn là glucose và fructose.' },
      { q: 'Chất nào sau đây là đường đơn, có trong máu người?', options: ['Saccharose', 'Tinh bột', 'Glucose', 'Cellulose'], correct: 2, explain: 'Glucose là đường đơn, chính là "đường huyết" trong máu người.' },
      { q: 'Polymer là hợp chất có đặc điểm gì?', options: ['Phân tử khối nhỏ', 'Phân tử khối rất lớn, tạo bởi nhiều mắt xích liên kết', 'Không tồn tại trong tự nhiên', 'Chỉ tồn tại ở thể khí'], correct: 1, explain: 'Polymer có phân tử khối rất lớn, được tạo thành từ nhiều mắt xích monome nối với nhau.' },
      { q: 'Chất nào sau đây là polymer thiên nhiên?', options: ['PE (polyethylene)', 'PVC', 'Tinh bột', 'Nylon'], correct: 2, explain: 'Tinh bột là polymer có sẵn trong tự nhiên (thực vật); PE, PVC, nylon là polymer tổng hợp.' }
    ]
  }
];
