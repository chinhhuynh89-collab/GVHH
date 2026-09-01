// Lớp 10 — môn Hoá học, chương trình GDPT 2018. 7 chương đầy đủ nội dung chi tiết.

const CHAPTERS_10 = [
  {
    id: 'c10-1',
    order: 1,
    title: 'Cấu tạo nguyên tử',
    icon: '⚛️',
    description: 'Thành phần nguyên tử, nguyên tố hoá học, cấu hình electron',
    lessons: [
      {
        title: 'Bài 1. Thành phần nguyên tử',
        points: [
          'Nguyên tử gồm hạt nhân (ở tâm) và lớp vỏ electron bao quanh.',
          'Hạt nhân gồm proton (điện tích +1, khối lượng ≈ 1u) và neutron (không mang điện, khối lượng ≈ 1u).',
          'Lớp vỏ gồm các electron (điện tích −1, khối lượng ≈ 0,00055u) chuyển động rất nhanh quanh hạt nhân.',
          'Nguyên tử trung hoà về điện: số electron = số proton.',
          'Kích thước nguyên tử cỡ 10⁻¹⁰ m; hạt nhân nhỏ hơn khoảng 10 000 lần nhưng chứa gần như toàn bộ khối lượng nguyên tử.'
        ]
      },
      {
        title: 'Bài 2. Nguyên tố hoá học',
        points: [
          'Số hiệu nguyên tử (Z) = số proton trong hạt nhân = số electron ở vỏ nguyên tử trung hoà.',
          'Số khối (A) = số proton (Z) + số neutron (N): A = Z + N.',
          'Nguyên tố hoá học là tập hợp các nguyên tử có cùng số hiệu nguyên tử Z.',
          'Kí hiệu nguyên tử viết dạng ᴬZX (A ở trên, Z ở dưới, trước kí hiệu nguyên tố X).',
          'Đồng vị: các nguyên tử của cùng một nguyên tố (cùng Z) nhưng khác số neutron (khác A).',
          'Nguyên tử khối trung bình = trung bình cộng có trọng số của các đồng vị theo % số nguyên tử trong tự nhiên.'
        ]
      },
      {
        title: 'Bài 3. Cấu trúc lớp vỏ electron nguyên tử',
        points: [
          'Orbital (obitan) nguyên tử là vùng không gian quanh hạt nhân có xác suất tìm thấy electron lớn nhất (≥90%).',
          'Electron sắp xếp theo lớp (n = 1, 2, 3…) và phân lớp (s, p, d, f); sức chứa tối đa: s = 2e, p = 6e, d = 10e, f = 14e.',
          'Nguyên lí vững bền: electron chiếm mức năng lượng từ thấp đến cao (1s → 2s → 2p → 3s → 3p → 4s → 3d → 4p…).',
          'Nguyên lí Pauli: mỗi orbital chứa tối đa 2 electron có chiều tự quay ngược nhau.',
          'Quy tắc Hund: trong cùng một phân lớp, electron phân bố sao cho số electron độc thân là tối đa trước khi ghép đôi.',
          'Cấu hình electron biểu diễn cách phân bố electron vào các phân lớp. Ví dụ Na (Z = 11): 1s² 2s² 2p⁶ 3s¹.',
          'Electron lớp ngoài cùng quyết định phần lớn tính chất hoá học của nguyên tố.'
        ]
      }
    ],
    flashcards: [
      { front: 'Proton', back: 'Hạt mang điện tích +1, nằm trong hạt nhân, khối lượng ≈ 1u' },
      { front: 'Neutron', back: 'Hạt không mang điện, nằm trong hạt nhân, khối lượng ≈ 1u' },
      { front: 'Electron', back: 'Hạt mang điện tích −1, chuyển động trong lớp vỏ, khối lượng ≈ 0,00055u' },
      { front: 'Số hiệu nguyên tử (Z)', back: 'Số proton trong hạt nhân = số electron của nguyên tử trung hoà' },
      { front: 'Số khối (A)', back: 'A = Z + N (số proton cộng số neutron)' },
      { front: 'Đồng vị', back: 'Các nguyên tử cùng số proton (Z) nhưng khác số neutron (khác A)' },
      { front: 'Orbital nguyên tử', back: 'Vùng không gian quanh hạt nhân có xác suất gặp electron lớn (≥90%)' },
      { front: 'Nguyên lí Pauli', back: 'Mỗi orbital chứa tối đa 2 electron có chiều tự quay ngược nhau' },
      { front: 'Quy tắc Hund', back: 'Electron phân bố tối đa số electron độc thân trước khi ghép đôi trong cùng phân lớp' },
      { front: 'Cấu hình electron của Na (Z = 11)', back: '1s² 2s² 2p⁶ 3s¹' }
    ],
    quiz: [
      { q: 'Hạt nào mang điện tích dương trong nguyên tử?', options: ['Electron', 'Proton', 'Neutron', 'Notron'], correct: 1, explain: 'Proton mang điện tích +1 và nằm trong hạt nhân.' },
      { q: 'Nguyên tử trung hoà về điện vì:', options: ['Số proton = số neutron', 'Số electron = số neutron', 'Số electron = số proton', 'Nguyên tử không có electron'], correct: 2, explain: 'Điện tích dương của proton cân bằng với điện tích âm của electron khi số lượng hai loại hạt bằng nhau.' },
      { q: 'Số khối A được tính theo công thức nào?', options: ['A = Z − N', 'A = Z + N', 'A = Z × N', 'A = N − Z'], correct: 1, explain: 'Số khối bằng tổng số proton và số neutron: A = Z + N.' },
      { q: 'Hai nguyên tử được coi là đồng vị của nhau khi:', options: ['Cùng số proton, khác số neutron', 'Cùng số neutron, khác số proton', 'Cùng số khối, khác số proton', 'Khác cả proton và neutron'], correct: 0, explain: 'Đồng vị là các nguyên tử của cùng nguyên tố (cùng Z) nhưng có số neutron khác nhau.' },
      { q: 'Phân lớp p chứa tối đa bao nhiêu electron?', options: ['2', '6', '10', '14'], correct: 1, explain: 'Phân lớp p có 3 orbital, mỗi orbital tối đa 2 electron → tối đa 6 electron.' },
      { q: 'Nguyên lí Pauli phát biểu điều gì?', options: ['Electron điền vào mức năng lượng thấp trước', 'Mỗi orbital chứa tối đa 2 electron ngược chiều tự quay', 'Số electron độc thân phải tối đa trong 1 phân lớp', 'Electron luôn ghép đôi ngay khi có thể'], correct: 1, explain: 'Đây chính là nội dung nguyên lí Pauli — quy tắc Hund mới nói về electron độc thân.' },
      { q: 'Electron lớp ngoài cùng quyết định điều gì của nguyên tố?', options: ['Khối lượng nguyên tử', 'Số neutron trong hạt nhân', 'Phần lớn tính chất hoá học', 'Kích thước hạt nhân'], correct: 2, explain: 'Electron lớp ngoài cùng tham gia liên kết hoá học nên quyết định phần lớn tính chất hoá học.' },
      { q: 'Kí hiệu nguyên tử ²³Na (Z = 11) cho biết nguyên tử Na có:', options: ['11 proton, 12 neutron', '11 proton, 23 neutron', '23 proton, 11 neutron', '12 proton, 11 neutron'], correct: 0, explain: 'Z = 11 proton; N = A − Z = 23 − 11 = 12 neutron.' }
    ]
  },
  {
    id: 'c10-2',
    order: 2,
    title: 'Bảng tuần hoàn và định luật tuần hoàn',
    icon: '🧪',
    description: 'Cấu tạo bảng tuần hoàn, xu hướng biến đổi tính chất, định luật tuần hoàn',
    lessons: [
      {
        title: 'Bài 4. Cấu tạo bảng tuần hoàn',
        points: [
          'Nguyên tắc sắp xếp: theo chiều tăng dần điện tích hạt nhân (số hiệu nguyên tử Z).',
          'Chu kỳ: hàng ngang gồm các nguyên tố có cùng số lớp electron. Bảng tuần hoàn có 7 chu kỳ.',
          'Nhóm: cột dọc gồm các nguyên tố có cấu hình electron lớp ngoài cùng tương tự nhau. Có 18 nhóm (nhóm A: nguyên tố s, p; nhóm B: nguyên tố d, f).',
          'Ô nguyên tố cho biết: số hiệu nguyên tử, kí hiệu hoá học, tên nguyên tố, nguyên tử khối.'
        ]
      },
      {
        title: 'Bài 5. Xu hướng biến đổi tính chất',
        points: [
          'Bán kính nguyên tử: giảm dần trong 1 chu kỳ (trái → phải) do điện tích hạt nhân tăng hút electron mạnh hơn; tăng dần trong 1 nhóm A (trên → dưới) do số lớp electron tăng.',
          'Độ âm điện: tăng dần trong 1 chu kỳ (trái → phải); giảm dần trong 1 nhóm A (trên → dưới).',
          'Tính kim loại: giảm dần trong 1 chu kỳ (trái → phải); tăng dần trong 1 nhóm A (trên → dưới).',
          'Tính phi kim: tăng dần trong 1 chu kỳ (trái → phải); giảm dần trong 1 nhóm A (trên → dưới).',
          'Tính base của oxide/hydroxide giảm dần, tính acid tăng dần khi đi từ trái sang phải trong 1 chu kỳ.'
        ]
      },
      {
        title: 'Bài 6. Định luật tuần hoàn và ý nghĩa',
        points: [
          'Định luật tuần hoàn: tính chất của các nguyên tố và hợp chất tạo nên từ chúng biến đổi tuần hoàn theo chiều tăng của điện tích hạt nhân nguyên tử.',
          'Ý nghĩa: biết vị trí (ô, chu kỳ, nhóm) có thể suy ra cấu tạo nguyên tử và tính chất cơ bản của nguyên tố, và ngược lại.',
          'Bảng tuần hoàn giúp dự đoán tính chất nguyên tố dựa vào vị trí lân cận — Mendeleev từng dùng cách này để tiên đoán các nguyên tố chưa được tìm ra năm 1869.'
        ]
      }
    ],
    flashcards: [
      { front: 'Chu kỳ', back: 'Hàng ngang trong bảng tuần hoàn, gồm các nguyên tố có cùng số lớp electron' },
      { front: 'Nhóm', back: 'Cột dọc trong bảng tuần hoàn, gồm các nguyên tố có cấu hình electron lớp ngoài cùng tương tự' },
      { front: 'Số chu kỳ trong bảng tuần hoàn', back: '7 chu kỳ' },
      { front: 'Số nhóm trong bảng tuần hoàn', back: '18 nhóm (nhóm A và nhóm B)' },
      { front: 'Bán kính nguyên tử trong 1 chu kỳ (trái → phải)', back: 'Giảm dần' },
      { front: 'Bán kính nguyên tử trong 1 nhóm A (trên → dưới)', back: 'Tăng dần' },
      { front: 'Độ âm điện trong 1 chu kỳ (trái → phải)', back: 'Tăng dần' },
      { front: 'Tính kim loại trong 1 nhóm A (trên → dưới)', back: 'Tăng dần' },
      { front: 'Định luật tuần hoàn', back: 'Tính chất các nguyên tố biến đổi tuần hoàn theo chiều tăng điện tích hạt nhân' },
      { front: 'Người xây dựng bảng tuần hoàn đầu tiên (1869)', back: 'Dmitri Mendeleev' }
    ],
    quiz: [
      { q: 'Bảng tuần hoàn được sắp xếp theo chiều tăng dần của đại lượng nào?', options: ['Khối lượng nguyên tử', 'Số neutron', 'Điện tích hạt nhân (Z)', 'Bán kính nguyên tử'], correct: 2, explain: 'Nguyên tắc sắp xếp hiện đại dựa trên số hiệu nguyên tử Z tăng dần.' },
      { q: 'Các nguyên tố trong cùng 1 chu kỳ có đặc điểm chung là:', options: ['Cùng số electron lớp ngoài cùng', 'Cùng số lớp electron', 'Cùng tính chất hoá học', 'Cùng thuộc 1 nhóm'], correct: 1, explain: 'Chu kỳ là hàng ngang gồm các nguyên tố có cùng số lớp electron.' },
      { q: 'Trong 1 chu kỳ, đi từ trái sang phải, bán kính nguyên tử:', options: ['Tăng dần', 'Giảm dần', 'Không đổi', 'Biến đổi không theo quy luật'], correct: 1, explain: 'Điện tích hạt nhân tăng làm electron bị hút gần hơn nên bán kính giảm dần.' },
      { q: 'Trong 1 nhóm A, đi từ trên xuống dưới, tính kim loại:', options: ['Tăng dần', 'Giảm dần', 'Không đổi', 'Tăng rồi giảm'], correct: 0, explain: 'Số lớp electron tăng làm electron ngoài cùng dễ mất hơn → tính kim loại tăng.' },
      { q: 'Trong 1 chu kỳ, đi từ trái sang phải, độ âm điện:', options: ['Giảm dần', 'Tăng dần', 'Không đổi', 'Không theo quy luật'], correct: 1, explain: 'Điện tích hạt nhân tăng làm khả năng hút electron liên kết tăng → độ âm điện tăng.' },
      { q: 'Bảng tuần hoàn hiện có bao nhiêu chu kỳ?', options: ['6', '7', '8', '18'], correct: 1, explain: 'Bảng tuần hoàn có 7 chu kỳ, tương ứng 7 lớp electron.' },
      { q: 'Định luật tuần hoàn phát biểu tính chất nguyên tố biến đổi tuần hoàn theo:', options: ['Nguyên tử khối', 'Điện tích hạt nhân', 'Số neutron', 'Số lớp electron'], correct: 1, explain: 'Định luật tuần hoàn gắn với chiều tăng của điện tích hạt nhân nguyên tử.' },
      { q: 'Ai là người có công lớn nhất xây dựng bảng tuần hoàn đầu tiên?', options: ['Rutherford', 'Bohr', 'Mendeleev', 'Dalton'], correct: 2, explain: 'Dmitri Mendeleev công bố bảng tuần hoàn đầu tiên năm 1869 và tiên đoán được nhiều nguyên tố chưa tìm ra.' }
    ]
  },
  {
    id: 'c10-3',
    order: 3,
    title: 'Liên kết hoá học',
    icon: '🔗',
    description: 'Quy tắc octet, liên kết ion, liên kết cộng hoá trị, liên kết hydrogen',
    lessons: [
      {
        title: 'Bài 7. Quy tắc octet',
        points: [
          'Nguyên tử có xu hướng đạt cấu hình electron bền vững của khí hiếm gần nhất (8 electron lớp ngoài cùng, riêng He là 2) bằng cách nhường, nhận hoặc góp chung electron.',
          'Đây gọi là quy tắc octet — cơ sở giải thích sự hình thành hầu hết các loại liên kết hoá học.'
        ]
      },
      {
        title: 'Bài 8. Liên kết ion',
        points: [
          'Liên kết ion hình thành do lực hút tĩnh điện giữa các ion mang điện tích trái dấu.',
          'Thường hình thành giữa kim loại điển hình (nhóm IA, IIA) và phi kim điển hình (nhóm VIA, VIIA).',
          'Ví dụ: Na nhường 1 electron cho Cl tạo thành Na⁺ và Cl⁻, hai ion hút nhau tạo thành NaCl.',
          'Hợp chất ion thường có nhiệt độ nóng chảy, nhiệt độ sôi cao; dẫn điện khi nóng chảy hoặc hoà tan trong nước.'
        ]
      },
      {
        title: 'Bài 9. Liên kết cộng hoá trị',
        points: [
          'Liên kết cộng hoá trị hình thành bởi một hay nhiều cặp electron dùng chung giữa 2 nguyên tử.',
          'Liên kết cộng hoá trị không cực: cặp electron dùng chung ở giữa 2 nguyên tử giống nhau (ví dụ Cl2, H2).',
          'Liên kết cộng hoá trị có cực: cặp electron dùng chung lệch về phía nguyên tử có độ âm điện lớn hơn (ví dụ HCl).',
          'Liên kết cho — nhận (phối trí): cặp electron dùng chung chỉ do một nguyên tử đóng góp.'
        ]
      },
      {
        title: 'Bài 10. Liên kết hydrogen và tương tác van der Waals',
        points: [
          'Liên kết hydrogen: lực hút tĩnh điện giữa nguyên tử H (liên kết với F, O, N có độ âm điện lớn) với một nguyên tử F, O, N khác có cặp electron riêng.',
          'Liên kết hydrogen làm tăng nhiệt độ sôi, nhiệt độ nóng chảy — giải thích vì sao nước có nhiệt độ sôi cao bất thường.',
          'Tương tác van der Waals: lực hút yếu giữa các phân tử, tăng theo khối lượng phân tử và diện tích tiếp xúc bề mặt.'
        ]
      }
    ],
    flashcards: [
      { front: 'Quy tắc octet', back: 'Nguyên tử có xu hướng đạt 8 electron (hoặc 2 với He) ở lớp ngoài cùng để bền vững như khí hiếm' },
      { front: 'Liên kết ion', back: 'Lực hút tĩnh điện giữa các ion trái dấu, thường giữa kim loại điển hình và phi kim điển hình' },
      { front: 'Liên kết cộng hoá trị', back: 'Liên kết hình thành bởi cặp electron dùng chung giữa 2 nguyên tử' },
      { front: 'Liên kết cộng hoá trị không cực', back: 'Cặp electron dùng chung ở giữa, giữa 2 nguyên tử giống nhau (VD: Cl2)' },
      { front: 'Liên kết cộng hoá trị có cực', back: 'Cặp electron dùng chung lệch về nguyên tử có độ âm điện lớn hơn (VD: HCl)' },
      { front: 'Liên kết hydrogen', back: 'Lực hút giữa H liên kết với F/O/N và một nguyên tử F/O/N khác có cặp electron riêng' },
      { front: 'Tương tác van der Waals', back: 'Lực hút yếu giữa các phân tử, tăng theo khối lượng phân tử' },
      { front: 'Ion dương (cation)', back: 'Ion mang điện tích dương, hình thành khi nguyên tử nhường electron' },
      { front: 'Ion âm (anion)', back: 'Ion mang điện tích âm, hình thành khi nguyên tử nhận electron' },
      { front: 'Ví dụ hợp chất ion điển hình', back: 'NaCl (muối ăn) — Na nhường 1 electron cho Cl' }
    ],
    quiz: [
      { q: 'Quy tắc octet phát biểu nguyên tử có xu hướng đạt cấu hình bền với bao nhiêu electron lớp ngoài cùng (trừ He)?', options: ['6', '8', '10', '2'], correct: 1, explain: 'Trừ He (2e), hầu hết nguyên tử có xu hướng đạt 8 electron lớp ngoài cùng.' },
      { q: 'Liên kết ion thường hình thành giữa:', options: ['Hai phi kim điển hình', 'Kim loại điển hình và phi kim điển hình', 'Hai kim loại điển hình', 'Hai khí hiếm'], correct: 1, explain: 'Kim loại điển hình dễ nhường electron, phi kim điển hình dễ nhận electron, tạo ion trái dấu hút nhau.' },
      { q: 'Trong phân tử Cl2, liên kết giữa 2 nguyên tử Cl là:', options: ['Liên kết ion', 'Liên kết cộng hoá trị có cực', 'Liên kết cộng hoá trị không cực', 'Liên kết hydrogen'], correct: 2, explain: '2 nguyên tử Cl giống nhau nên cặp electron dùng chung không lệch về bên nào.' },
      { q: 'Trong phân tử HCl, cặp electron dùng chung lệch về phía nguyên tử nào?', options: ['H', 'Cl', 'Lệch đều 2 bên', 'Không xác định'], correct: 1, explain: 'Cl có độ âm điện lớn hơn H nên hút cặp electron dùng chung về phía mình.' },
      { q: 'Liên kết hydrogen được hình thành giữa H liên kết với nguyên tử có độ âm điện lớn (F, O, N) và:', options: ['Bất kỳ nguyên tử nào', 'Một nguyên tử F, O, N khác có cặp electron riêng', 'Một nguyên tử kim loại', 'Một ion dương'], correct: 1, explain: 'Liên kết hydrogen cần cặp electron riêng của nguyên tử F/O/N thứ hai.' },
      { q: 'Vì sao nước có nhiệt độ sôi cao bất thường so với các hợp chất cùng nhóm?', options: ['Do liên kết ion mạnh', 'Do liên kết hydrogen giữa các phân tử nước', 'Do khối lượng phân tử lớn', 'Do tương tác van der Waals mạnh'], correct: 1, explain: 'Liên kết hydrogen giữa các phân tử H2O làm tăng đáng kể nhiệt độ sôi.' },
      { q: 'Hợp chất ion (như NaCl) có tính chất đặc trưng nào?', options: ['Nhiệt độ nóng chảy thấp', 'Không dẫn điện khi nóng chảy', 'Nhiệt độ nóng chảy, nhiệt độ sôi cao', 'Luôn ở thể khí'], correct: 2, explain: 'Lực hút tĩnh điện giữa các ion rất mạnh nên cần nhiệt độ cao để phá vỡ mạng tinh thể ion.' },
      { q: 'Cation là:', options: ['Ion mang điện âm', 'Ion mang điện dương', 'Nguyên tử trung hoà', 'Phân tử không phân cực'], correct: 1, explain: 'Cation hình thành khi nguyên tử nhường electron, mang điện tích dương.' }
    ]
  },
  {
    id: 'c10-4',
    order: 4,
    title: 'Phản ứng oxi hoá – khử',
    icon: '🔥',
    description: 'Số oxi hoá, chất khử – chất oxi hoá, cân bằng phương trình oxi hoá – khử',
    lessons: [
      {
        title: 'Bài 11. Khái niệm phản ứng oxi hoá – khử',
        points: [
          'Số oxi hoá: điện tích quy ước của nguyên tử trong phân tử nếu giả định các electron liên kết chuyển hẳn về nguyên tử có độ âm điện lớn hơn.',
          'Quy tắc xác định số oxi hoá: đơn chất = 0; ion đơn nguyên tử = điện tích ion; H thường +1 (trừ hydride kim loại −1); O thường −2 (trừ peroxide −1); tổng số oxi hoá trong phân tử trung hoà = 0, trong ion = điện tích ion.',
          'Chất khử (chất bị oxi hoá): chất nhường electron, số oxi hoá tăng.',
          'Chất oxi hoá (chất bị khử): chất nhận electron, số oxi hoá giảm.',
          'Phản ứng oxi hoá – khử: phản ứng hoá học có sự chuyển electron giữa các chất phản ứng (số oxi hoá của ít nhất 1 nguyên tố thay đổi).'
        ]
      },
      {
        title: 'Bài 12. Lập phương trình hoá học của phản ứng oxi hoá – khử',
        points: [
          'Phương pháp thăng bằng electron gồm 4 bước: (1) xác định số oxi hoá các nguyên tố thay đổi; (2) viết quá trình oxi hoá và quá trình khử; (3) cân bằng sao cho số electron nhường = số electron nhận; (4) đặt hệ số vào phương trình và cân bằng các nguyên tố còn lại.'
        ]
      },
      {
        title: 'Bài 13. Ý nghĩa và ứng dụng của phản ứng oxi hoá – khử',
        points: [
          'Phản ứng oxi hoá – khử là cơ sở của nhiều quá trình quan trọng: đốt cháy nhiên liệu, luyện kim (điều chế kim loại), pin và ắc quy, ăn mòn kim loại, quang hợp, hô hấp tế bào.'
        ]
      }
    ],
    flashcards: [
      { front: 'Số oxi hoá', back: 'Điện tích quy ước của nguyên tử trong phân tử nếu electron liên kết chuyển hẳn về nguyên tử có độ âm điện lớn hơn' },
      { front: 'Chất khử', back: 'Chất nhường electron, số oxi hoá tăng sau phản ứng' },
      { front: 'Chất oxi hoá', back: 'Chất nhận electron, số oxi hoá giảm sau phản ứng' },
      { front: 'Số oxi hoá của đơn chất', back: 'Luôn bằng 0' },
      { front: 'Số oxi hoá của H trong hợp chất (thường)', back: '+1 (trừ hydride kim loại là −1)' },
      { front: 'Số oxi hoá của O trong hợp chất (thường)', back: '−2 (trừ peroxide là −1)' },
      { front: 'Phản ứng oxi hoá – khử', back: 'Phản ứng có sự chuyển electron, làm thay đổi số oxi hoá của ít nhất 1 nguyên tố' },
      { front: 'Phương pháp cân bằng electron', back: 'Cân bằng số electron nhường = số electron nhận giữa chất khử và chất oxi hoá' },
      { front: 'Quá trình oxi hoá', back: 'Quá trình nhường electron (số oxi hoá tăng)' },
      { front: 'Quá trình khử', back: 'Quá trình nhận electron (số oxi hoá giảm)' }
    ],
    quiz: [
      { q: 'Số oxi hoá của đơn chất luôn bằng:', options: ['+1', '−1', '0', 'Tuỳ chất'], correct: 2, explain: 'Trong đơn chất, các nguyên tử liên kết với nhau nên không có sự lệch electron, số oxi hoá = 0.' },
      { q: 'Chất khử là chất:', options: ['Nhận electron', 'Nhường electron', 'Không thay đổi số oxi hoá', 'Luôn là phi kim'], correct: 1, explain: 'Chất khử nhường electron nên số oxi hoá của nó tăng lên.' },
      { q: 'Trong phản ứng Fe + CuSO4 → FeSO4 + Cu, chất nào là chất khử?', options: ['Fe', 'Cu', 'CuSO4', 'FeSO4'], correct: 0, explain: 'Fe nhường electron (Fe → Fe²⁺ + 2e), số oxi hoá tăng từ 0 lên +2 nên Fe là chất khử.' },
      { q: 'Số oxi hoá của O trong H2O2 (hydrogen peroxide) là:', options: ['−2', '−1', '0', '+1'], correct: 1, explain: 'Trong peroxide, O có số oxi hoá −1 — đây là trường hợp đặc biệt cần nhớ.' },
      { q: 'Quá trình khử là quá trình:', options: ['Nhường electron', 'Nhận electron', 'Không đổi số oxi hoá', 'Tạo liên kết ion'], correct: 1, explain: 'Quá trình khử là quá trình nhận electron, làm số oxi hoá giảm.' },
      { q: 'Phương pháp thăng bằng electron dùng để:', options: ['Tính khối lượng mol', 'Lập phương trình phản ứng oxi hoá – khử', 'Tính pH dung dịch', 'Xác định đồng vị'], correct: 1, explain: 'Đây là phương pháp cân bằng hệ số cho phản ứng oxi hoá – khử dựa trên số electron trao đổi.' },
      { q: 'Phản ứng oxi hoá – khử KHÔNG xuất hiện trong quá trình nào sau đây?', options: ['Đốt cháy nhiên liệu', 'Ăn mòn kim loại', 'Trung hoà acid – base', 'Điện phân'], correct: 2, explain: 'Phản ứng trung hoà acid – base là phản ứng trao đổi, không làm thay đổi số oxi hoá.' },
      { q: 'Tổng số oxi hoá của các nguyên tố trong 1 phân tử trung hoà bằng:', options: ['+1', '−1', '0', 'Bằng số nguyên tử'], correct: 2, explain: 'Phân tử trung hoà về điện nên tổng số oxi hoá của các nguyên tố trong phân tử luôn bằng 0.' }
    ]
  },
  {
    id: 'c10-5',
    order: 5,
    title: 'Năng lượng hoá học',
    icon: '⚡',
    description: 'Phản ứng toả nhiệt – thu nhiệt, enthalpy tạo thành, biến thiên enthalpy phản ứng',
    lessons: [
      {
        title: 'Bài 14. Phản ứng toả nhiệt, phản ứng thu nhiệt',
        points: [
          'Phản ứng toả nhiệt: giải phóng năng lượng (dạng nhiệt) ra môi trường, biến thiên enthalpy ΔrH < 0 (VD: đốt cháy nhiên liệu).',
          'Phản ứng thu nhiệt: hấp thụ năng lượng từ môi trường, ΔrH > 0 (VD: nung đá vôi CaCO3 → CaO + CO2).',
          'Điều kiện chuẩn trong nhiệt hoá học: áp suất 1 bar, nhiệt độ thường lấy 25°C (298K).'
        ]
      },
      {
        title: 'Bài 15. Enthalpy tạo thành và biến thiên enthalpy của phản ứng hoá học',
        points: [
          'Enthalpy tạo thành chuẩn (ΔfH°298) của một chất: biến thiên enthalpy của phản ứng tạo thành 1 mol chất đó từ các đơn chất bền ở điều kiện chuẩn.',
          'Biến thiên enthalpy chuẩn của phản ứng: ΔrH°298 = tổng enthalpy tạo thành sản phẩm − tổng enthalpy tạo thành chất đầu (theo hệ số cân bằng).',
          'Có thể tính ΔrH° dựa vào năng lượng liên kết: ΔrH° = tổng năng lượng liên kết chất đầu − tổng năng lượng liên kết sản phẩm.'
        ]
      }
    ],
    flashcards: [
      { front: 'Phản ứng toả nhiệt', back: 'Phản ứng giải phóng năng lượng ra môi trường, ΔrH < 0' },
      { front: 'Phản ứng thu nhiệt', back: 'Phản ứng hấp thụ năng lượng từ môi trường, ΔrH > 0' },
      { front: 'Điều kiện chuẩn (trong nhiệt hoá học)', back: 'Áp suất 1 bar, thường lấy nhiệt độ 25°C (298K)' },
      { front: 'Enthalpy tạo thành chuẩn', back: 'Biến thiên enthalpy khi tạo thành 1 mol chất từ đơn chất bền ở điều kiện chuẩn' },
      { front: 'Biến thiên enthalpy phản ứng (ΔrH°)', back: 'Nhiệt lượng toả ra hoặc thu vào khi phản ứng xảy ra ở điều kiện chuẩn' },
      { front: 'Công thức tính ΔrH° theo enthalpy tạo thành', back: 'ΔrH° = ΣΔfH°(sản phẩm) − ΣΔfH°(chất đầu)' },
      { front: 'Công thức tính ΔrH° theo năng lượng liên kết', back: 'ΔrH° = ΣE liên kết(chất đầu) − ΣE liên kết(sản phẩm)' },
      { front: 'Ví dụ phản ứng toả nhiệt', back: 'Đốt cháy nhiên liệu (than, xăng, khí gas)' },
      { front: 'Ví dụ phản ứng thu nhiệt', back: 'Nung vôi: CaCO3 → CaO + CO2' },
      { front: 'Đơn vị của enthalpy', back: 'kJ/mol hoặc kJ' }
    ],
    quiz: [
      { q: 'Phản ứng toả nhiệt có ΔrH:', options: ['> 0', '< 0', '= 0', 'Không xác định'], correct: 1, explain: 'Phản ứng toả nhiệt giải phóng năng lượng nên ΔrH mang giá trị âm.' },
      { q: 'Phản ứng nung vôi CaCO3 → CaO + CO2 là phản ứng:', options: ['Toả nhiệt', 'Thu nhiệt', 'Không trao đổi nhiệt', 'Oxi hoá – khử'], correct: 1, explain: 'Phản ứng này cần cung cấp nhiệt liên tục để xảy ra nên là phản ứng thu nhiệt.' },
      { q: 'Điều kiện chuẩn trong nhiệt hoá học thường quy ước áp suất là:', options: ['1 atm', '1 bar', '1 Pa', '760 mmHg'], correct: 1, explain: 'Theo IUPAC hiện hành, điều kiện chuẩn quy ước áp suất 1 bar.' },
      { q: 'Enthalpy tạo thành chuẩn của một đơn chất bền (VD: O2, N2, C than chì) bằng:', options: ['+1 kJ/mol', '−1 kJ/mol', '0 kJ/mol', 'Không xác định'], correct: 2, explain: 'Đơn chất bền ở điều kiện chuẩn được quy ước có enthalpy tạo thành bằng 0.' },
      { q: 'Công thức tính biến thiên enthalpy chuẩn của phản ứng theo enthalpy tạo thành là:', options: ['ΔrH° = ΣΔfH°(chất đầu) − ΣΔfH°(sản phẩm)', 'ΔrH° = ΣΔfH°(sản phẩm) − ΣΔfH°(chất đầu)', 'ΔrH° = ΣΔfH°(sản phẩm) + ΣΔfH°(chất đầu)', 'ΔrH° = ΔfH°(sản phẩm) × ΔfH°(chất đầu)'], correct: 1, explain: 'Lấy tổng enthalpy tạo thành sản phẩm trừ tổng enthalpy tạo thành chất đầu.' },
      { q: 'Đốt cháy khí gas là ví dụ của phản ứng:', options: ['Thu nhiệt', 'Toả nhiệt', 'Không đổi nhiệt', 'Trung hoà'], correct: 1, explain: 'Đốt cháy nhiên liệu luôn giải phóng nhiệt lượng lớn ra môi trường.' },
      { q: 'Đơn vị thường dùng cho biến thiên enthalpy phản ứng là:', options: ['kJ/mol', 'g/mol', 'mol/l', '°C'], correct: 0, explain: 'Enthalpy phản ứng thường được biểu diễn theo đơn vị năng lượng trên mol, kJ/mol.' },
      { q: 'Dựa vào năng lượng liên kết, nếu tổng năng lượng liên kết chất đầu LỚN HƠN tổng năng lượng liên kết sản phẩm thì phản ứng:', options: ['Toả nhiệt', 'Thu nhiệt', 'Không xảy ra', 'Cân bằng'], correct: 1, explain: 'ΔrH° = ΣE(chất đầu) − ΣE(sản phẩm) > 0 khi liên kết sản phẩm kém bền hơn, tức là thu nhiệt.' }
    ]
  },
  {
    id: 'c10-6',
    order: 6,
    title: 'Tốc độ phản ứng hoá học',
    icon: '⏱️',
    description: 'Khái niệm tốc độ phản ứng, các yếu tố ảnh hưởng đến tốc độ phản ứng',
    lessons: [
      {
        title: 'Bài 16. Khái niệm tốc độ phản ứng hoá học',
        points: [
          'Tốc độ phản ứng là đại lượng đặc trưng cho sự biến thiên nồng độ của một chất phản ứng hoặc sản phẩm trong một đơn vị thời gian.',
          'Tốc độ trung bình: v = ΔC / Δt (đơn vị thường dùng: mol/(l·s)).',
          'Định luật tác dụng khối lượng: với phản ứng đơn giản aA + bB → sản phẩm, tốc độ v = k·[A]^a·[B]^b, trong đó k là hằng số tốc độ, phụ thuộc nhiệt độ và bản chất phản ứng.'
        ]
      },
      {
        title: 'Bài 17. Các yếu tố ảnh hưởng đến tốc độ phản ứng',
        points: [
          'Nồng độ: nồng độ chất phản ứng tăng → tốc độ phản ứng tăng.',
          'Áp suất (với phản ứng có chất khí): áp suất tăng → nồng độ khí tăng → tốc độ tăng.',
          'Nhiệt độ: nhiệt độ tăng → tốc độ phản ứng tăng; theo quy tắc Van’t Hoff, tăng 10°C tốc độ thường tăng 2–4 lần.',
          'Diện tích bề mặt tiếp xúc: diện tích tăng (chất rắn nghiền nhỏ) → tốc độ tăng.',
          'Chất xúc tác: làm tăng tốc độ phản ứng nhưng không bị tiêu hao sau phản ứng.'
        ]
      }
    ],
    flashcards: [
      { front: 'Tốc độ phản ứng', back: 'Đại lượng đặc trưng cho sự biến thiên nồng độ chất phản ứng/sản phẩm trong 1 đơn vị thời gian' },
      { front: 'Công thức tốc độ trung bình', back: 'v = ΔC/Δt (mol/(l·s))' },
      { front: 'Định luật tác dụng khối lượng', back: 'v = k·[A]^a·[B]^b với phản ứng đơn giản aA + bB → sản phẩm' },
      { front: 'Hằng số tốc độ k', back: 'Phụ thuộc nhiệt độ và bản chất phản ứng, không phụ thuộc nồng độ' },
      { front: 'Ảnh hưởng của nồng độ đến tốc độ', back: 'Nồng độ chất phản ứng tăng → tốc độ phản ứng tăng' },
      { front: 'Ảnh hưởng của nhiệt độ đến tốc độ', back: 'Nhiệt độ tăng → tốc độ phản ứng tăng' },
      { front: 'Quy tắc Van’t Hoff', back: 'Nhiệt độ tăng 10°C, tốc độ phản ứng thường tăng 2–4 lần' },
      { front: 'Ảnh hưởng của diện tích bề mặt', back: 'Diện tích tiếp xúc tăng (nghiền nhỏ) → tốc độ phản ứng tăng' },
      { front: 'Chất xúc tác', back: 'Làm tăng tốc độ phản ứng nhưng không bị tiêu hao sau phản ứng' },
      { front: 'Ảnh hưởng của áp suất (phản ứng có khí)', back: 'Áp suất tăng → tốc độ phản ứng tăng' }
    ],
    quiz: [
      { q: 'Tốc độ phản ứng được tính bằng công thức nào?', options: ['v = C/t', 'v = ΔC/Δt', 'v = C×t', 'v = t/ΔC'], correct: 1, explain: 'Tốc độ trung bình bằng biến thiên nồng độ chia cho biến thiên thời gian.' },
      { q: 'Yếu tố nào sau đây làm tăng tốc độ phản ứng nhưng không bị tiêu hao?', options: ['Nhiệt độ', 'Chất xúc tác', 'Áp suất', 'Nồng độ'], correct: 1, explain: 'Chất xúc tác tham gia phản ứng trung gian nhưng được tái sinh, không bị tiêu hao.' },
      { q: 'Khi nghiền nhỏ chất rắn trước khi phản ứng, tốc độ phản ứng sẽ:', options: ['Giảm', 'Tăng', 'Không đổi', 'Bằng 0'], correct: 1, explain: 'Nghiền nhỏ làm tăng diện tích bề mặt tiếp xúc, tốc độ phản ứng tăng.' },
      { q: 'Theo quy tắc Van’t Hoff, khi tăng nhiệt độ thêm 10°C, tốc độ phản ứng thường:', options: ['Giảm một nửa', 'Không đổi', 'Tăng 2–4 lần', 'Tăng 10 lần'], correct: 2, explain: 'Đây là nội dung quy tắc kinh nghiệm Van’t Hoff về ảnh hưởng của nhiệt độ.' },
      { q: 'Hằng số tốc độ k trong định luật tác dụng khối lượng phụ thuộc vào:', options: ['Nồng độ chất phản ứng', 'Nhiệt độ và bản chất phản ứng', 'Thể tích bình phản ứng', 'Áp suất khí quyển'], correct: 1, explain: 'k là hằng số đặc trưng cho phản ứng ở một nhiệt độ xác định, không phụ thuộc nồng độ.' },
      { q: 'Đối với phản ứng có chất khí tham gia, khi tăng áp suất thì tốc độ phản ứng:', options: ['Giảm', 'Tăng', 'Không đổi', 'Chỉ tăng khi có xúc tác'], correct: 1, explain: 'Tăng áp suất làm tăng nồng độ chất khí, do đó tốc độ phản ứng tăng.' },
      { q: 'Đơn vị của tốc độ phản ứng thường là:', options: ['mol/(l·s)', 'g/mol', 'mol/l', 'J/mol'], correct: 0, explain: 'Tốc độ phản ứng là biến thiên nồng độ (mol/l) theo thời gian (s).' },
      { q: 'Nồng độ chất phản ứng tăng thì tốc độ phản ứng:', options: ['Luôn giảm', 'Luôn tăng', 'Không thay đổi', 'Không liên quan'], correct: 1, explain: 'Theo định luật tác dụng khối lượng, tốc độ tỉ lệ thuận với nồng độ chất phản ứng.' }
    ]
  },
  {
    id: 'c10-7',
    order: 7,
    title: 'Nguyên tố nhóm VIIA (Halogen)',
    icon: '🧂',
    description: 'Đơn chất halogen, hydrogen halide, hydrohalic acid và ứng dụng hợp chất halogen',
    lessons: [
      {
        title: 'Bài 18. Đơn chất halogen',
        points: [
          'Nhóm VIIA gồm: F, Cl, Br, I (At là nguyên tố phóng xạ hiếm).',
          'Cấu hình electron lớp ngoài cùng: ns²np⁵ → dễ nhận thêm 1 electron để đạt cấu hình bền của khí hiếm → tính oxi hoá mạnh.',
          'Đơn chất tồn tại dạng phân tử 2 nguyên tử (X2), liên kết cộng hoá trị không cực.',
          'Tính oxi hoá giảm dần từ F2 → Cl2 → Br2 → I2 (F2 có tính oxi hoá mạnh nhất).',
          'Màu sắc và trạng thái: F2 (khí, lục nhạt), Cl2 (khí, vàng lục), Br2 (lỏng, nâu đỏ), I2 (rắn, tím đen, dễ thăng hoa).'
        ]
      },
      {
        title: 'Bài 19. Hydrogen halide và hydrohalic acid',
        points: [
          'Hydrogen halide (HX) là hợp chất cộng hoá trị có cực, tan trong nước tạo dung dịch acid (hydrohalic acid).',
          'Tính acid tăng dần: HF (acid yếu) < HCl < HBr < HI (HCl, HBr, HI đều là acid mạnh).',
          'HCl là hoá chất công nghiệp quan trọng, dùng tẩy gỉ kim loại, sản xuất hoá chất khác.'
        ]
      },
      {
        title: 'Bài 20. Ứng dụng của một số hợp chất halogen',
        points: [
          'NaCl: muối ăn, nguyên liệu sản xuất Cl2, NaOH, HCl (điện phân dung dịch).',
          'NaF: bổ sung vào kem đánh răng chống sâu răng.',
          'Cl2: khử trùng nước sinh hoạt, sản xuất chất tẩy trắng, PVC.',
          'AgBr: dùng trong công nghệ ảnh (nhạy sáng).',
          'I2 và KI: bổ sung iot vào muối ăn, phòng bệnh bướu cổ.'
        ]
      }
    ],
    flashcards: [
      { front: 'Nhóm VIIA', back: 'F, Cl, Br, I, At — có cấu hình electron ns²np⁵ ở lớp ngoài cùng' },
      { front: 'Tính oxi hoá của halogen', back: 'Giảm dần theo thứ tự F2 > Cl2 > Br2 > I2' },
      { front: 'Màu sắc Cl2', back: 'Khí màu vàng lục' },
      { front: 'Màu sắc Br2', back: 'Chất lỏng màu nâu đỏ' },
      { front: 'Màu sắc I2', back: 'Chất rắn màu tím đen, dễ thăng hoa' },
      { front: 'Hydrohalic acid mạnh nhất', back: 'HI (mạnh nhất trong dãy HCl, HBr, HI); HF là acid yếu' },
      { front: 'Ứng dụng của Cl2', back: 'Khử trùng nước sinh hoạt, sản xuất chất tẩy trắng và PVC' },
      { front: 'Ứng dụng của NaF', back: 'Bổ sung vào kem đánh răng chống sâu răng' },
      { front: 'Ứng dụng của I2/KI', back: 'Bổ sung iot vào muối ăn, phòng bệnh bướu cổ' },
      { front: 'Đơn chất halogen tồn tại ở dạng', back: 'Phân tử 2 nguyên tử X2, liên kết cộng hoá trị không cực' }
    ],
    quiz: [
      { q: 'Cấu hình electron lớp ngoài cùng của nhóm VIIA là:', options: ['ns²np³', 'ns²np⁴', 'ns²np⁵', 'ns²np⁶'], correct: 2, explain: 'Nhóm VIIA có 7 electron lớp ngoài cùng: ns²np⁵.' },
      { q: 'Tính oxi hoá của các halogen giảm dần theo thứ tự nào?', options: ['F2 > Cl2 > Br2 > I2', 'I2 > Br2 > Cl2 > F2', 'Cl2 > F2 > Br2 > I2', 'Br2 > I2 > F2 > Cl2'], correct: 0, explain: 'Từ trên xuống nhóm VIIA, bán kính tăng làm khả năng hút electron giảm nên tính oxi hoá giảm dần.' },
      { q: 'Ở điều kiện thường, Br2 tồn tại ở trạng thái nào?', options: ['Khí', 'Lỏng', 'Rắn', 'Plasma'], correct: 1, explain: 'Br2 là halogen duy nhất ở thể lỏng tại nhiệt độ phòng.' },
      { q: 'Acid nào sau đây là acid yếu trong dãy hydrohalic acid?', options: ['HCl', 'HBr', 'HI', 'HF'], correct: 3, explain: 'HF là acid yếu do liên kết H–F rất bền; HCl, HBr, HI đều là acid mạnh.' },
      { q: 'Cl2 được dùng phổ biến để:', options: ['Bổ sung dinh dưỡng', 'Khử trùng nước sinh hoạt', 'Làm nhiên liệu', 'Làm chất bôi trơn'], correct: 1, explain: 'Cl2 có tính oxi hoá mạnh, được dùng khử trùng nước sinh hoạt.' },
      { q: 'I2 có đặc điểm vật lí nổi bật nào?', options: ['Là chất khí không màu', 'Là chất rắn dễ thăng hoa, màu tím đen', 'Là chất lỏng không màu', 'Tan tốt trong nước'], correct: 1, explain: 'I2 là chất rắn màu tím đen, có khả năng thăng hoa (chuyển thẳng từ rắn sang khí).' },
      { q: 'NaF thường được thêm vào sản phẩm nào để chống sâu răng?', options: ['Muối ăn', 'Kem đánh răng', 'Nước giải khát', 'Sữa'], correct: 1, explain: 'Fluoride (NaF) được thêm vào kem đánh răng giúp men răng chắc khoẻ hơn.' },
      { q: 'Đơn chất halogen tồn tại chủ yếu ở dạng nào?', options: ['Nguyên tử tự do', 'Phân tử X2 với liên kết cộng hoá trị không cực', 'Ion X⁻ tự do', 'Hợp chất với oxygen'], correct: 1, explain: 'Halogen luôn tồn tại dạng phân tử 2 nguyên tử X2 ở trạng thái đơn chất.' }
    ]
  }
];
