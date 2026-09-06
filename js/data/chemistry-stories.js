// Nội dung biên tập tĩnh — KHÔNG lấy từ Firestore, KHÔNG do người dùng tạo ra. Viết mới hoàn toàn
// (không sao chép nguyên văn từ nguồn), mỗi mục kèm 1 link Wikipedia để đọc thêm/kiểm chứng.
// Xem js/features/chemistry-stories.js để biết cách hiển thị.

const STORY_CATEGORIES = [
  { id: 'history', icon: '🏛️', label: 'Lịch sử Hoá học' },
  { id: 'chemist', icon: '👩‍🔬', label: 'Nhà hoá học nổi tiếng' },
  { id: 'invention', icon: '💡', label: 'Phát minh vĩ đại' }
];

const CHEMISTRY_STORIES = [
  // ---------- Lịch sử Hoá học ----------
  {
    id: 'lavoisier-cach-mang-hoa-hoc',
    category: 'history',
    icon: '⚖️',
    title: 'Lavoisier và câu cân không hề nói dối',
    summary: 'Cách một cái cân đánh đổ thuyết "phlogiston" và khai sinh hoá học hiện đại.',
    body: [
      'Cuối thế kỷ 18, giới khoa học tin rằng có một chất vô hình tên "phlogiston" thoát ra khỏi vật khi nó cháy. Antoine Lavoisier không tin vào lời đồn — ông tin vào chiếc cân của mình.',
      'Bằng cách nung kim loại trong bình kín rồi cân lại thật kỹ trước và sau phản ứng, ông phát hiện khối lượng không hề biến mất — nó chỉ chuyển từ dạng này sang dạng khác, vì kim loại đã kết hợp với một phần không khí (oxy) để tạo thành oxit kim loại. Từ đó, Định luật bảo toàn khối lượng ra đời, trở thành nền móng của hoá học hiện đại và chấm dứt thời đại "phlogiston".',
      'Trớ trêu thay, "cha đẻ của hoá học hiện đại" lại bị xử chém năm 1794 trong Cách mạng Pháp vì từng làm việc thu thuế cho triều đình cũ. Một vị quan toà khi đó tuyên bố: "Nền cộng hoà không cần đến các nhà bác học."'
    ],
    sourceLabel: 'Wikipedia — Antoine Lavoisier',
    sourceUrl: 'https://vi.wikipedia.org/wiki/Antoine_Lavoisier'
  },
  {
    id: 'phospho-tu-nuoc-tieu',
    category: 'history',
    icon: '✨',
    title: 'Đi tìm vàng, tìm ra thứ phát sáng trong bóng tối',
    summary: 'Nhà giả kim Hennig Brand cố chưng cất nước tiểu thành vàng — và tình cờ khám phá ra phốt pho.',
    body: [
      'Năm 1669, nhà giả kim thuật người Đức Hennig Brand tin rằng nước tiểu con người — vốn có màu vàng — chứa "tinh hoa" có thể chưng cất thành vàng thật. Ông thu gom hàng trăm lít nước tiểu, đun sôi cô đặc trong nhiều ngày.',
      'Vàng thì không thấy đâu, nhưng ông thu được một chất sáp trắng phát ra ánh sáng xanh lục yếu ớt trong bóng tối — không cần lửa, không cần nhiệt. Ông đặt tên nó là "phosphorus" (tiếng Hy Lạp nghĩa là "vật mang ánh sáng"). Đó chính là nguyên tố phốt pho, nguyên tố đầu tiên trong lịch sử được khám phá bởi một cá nhân xác định, thay vì được biết đến từ thời cổ đại.',
      'Hennig Brand giữ bí mật công thức để bán lại cho các nhà giả kim khác kiếm lời — mãi về sau các nhà hoá học khác mới tìm ra cách điều chế phốt pho độc lập và xác định đúng bản chất nguyên tố của nó.'
    ],
    sourceLabel: 'Wikipedia — Hennig Brand',
    sourceUrl: 'https://en.wikipedia.org/wiki/Hennig_Brand'
  },
  {
    id: 'ai-tim-ra-oxy-truoc',
    category: 'history',
    icon: '💨',
    title: 'Ai mới thực sự là người tìm ra khí oxy?',
    summary: 'Ba nhà khoa học ở ba nước cùng chạm vào oxy gần như cùng lúc — nhưng chỉ một người được ghi công đặt tên.',
    body: [
      'Khoảng năm 1771-1774, ít nhất ba nhà khoa học độc lập tạo ra được khí oxy trong phòng thí nghiệm: Carl Wilhelm Scheele (Thuỵ Điển) làm ra khí này sớm nhất nhưng công bố kết quả muộn; Joseph Priestley (Anh) nung oxit thuỷ ngân bằng kính lúp hội tụ ánh sáng mặt trời và công bố đầu tiên; còn Antoine Lavoisier (Pháp) là người hiểu đúng bản chất của khí này và đặt tên "oxygène".',
      'Trớ trêu là Priestley và Scheele — hai người thực sự tạo ra khí oxy trước — vẫn tin theo thuyết phlogiston cũ và không nhận ra mình vừa khám phá ra điều gì. Chính Lavoisier, người sau này giải thích đúng vai trò của oxy trong sự cháy, mới là cái tên được lịch sử hoá học nhắc đến nhiều nhất gắn với nguyên tố này.',
      'Câu chuyện là lời nhắc rằng trong khoa học, "khám phá ra" và "hiểu đúng ý nghĩa của khám phá đó" đôi khi là hai việc rất khác nhau.'
    ],
    sourceLabel: 'Wikipedia — Joseph Priestley',
    sourceUrl: 'https://en.wikipedia.org/wiki/Joseph_Priestley'
  },
  {
    id: 'don-vi-mol-avogadro',
    category: 'history',
    icon: '🔢',
    title: 'Con số lớn nhất bạn từng dùng mà không để ý',
    summary: 'Vì sao hoá học cần một "đơn vị đếm" riêng — và con số 6,022×10²³ đến từ đâu.',
    body: [
      'Nguyên tử và phân tử nhỏ đến mức không thể đếm từng cái một, nhưng phản ứng hoá học lại cần biết chính xác bao nhiêu hạt đang tham gia. Đầu thế kỷ 19, Amedeo Avogadro đưa ra giả thuyết: ở cùng điều kiện nhiệt độ, áp suất, thể tích khí bằng nhau chứa số phân tử bằng nhau — bất kể đó là khí gì.',
      'Từ giả thuyết đó, các nhà hoá học sau này xây dựng nên khái niệm "mol" — một đơn vị đếm giống như "một tá" (12 cái) hay "một rám" (500 tờ giấy), chỉ khác là con số ở đây khổng lồ: khoảng 6,022×10²³ hạt trong 1 mol. Nếu đếm mỗi giây một hạt, đếm hết 1 mol sẽ tốn thời gian dài hơn nhiều lần tuổi của vũ trụ.',
      'Điều thú vị: Avogadro qua đời (1856) trước khi con số này được đặt theo tên ông — chính Jean Perrin là người đề xuất gọi nó là "số Avogadro" vào năm 1909, để vinh danh đóng góp của ông dù ông chưa từng tự mình tính ra con số đó.'
    ],
    sourceLabel: 'Wikipedia — Avogadro constant',
    sourceUrl: 'https://en.wikipedia.org/wiki/Avogadro_constant'
  },
  {
    id: 'bon-nguyen-to-moi-2016',
    category: 'history',
    icon: '🆕',
    title: 'Bảng tuần hoàn vừa "chật thêm" 4 chỗ vào năm 2016',
    summary: 'Nihonium, Moscovium, Tennessine, Oganesson — những nguyên tố trẻ nhất, sống ngắn nhất bảng tuần hoàn.',
    body: [
      'Bảng tuần hoàn không phải là một danh sách đã đóng băng từ thời Mendeleev. Năm 2016, IUPAC (Liên đoàn Hoá học Thuần tuý và Ứng dụng Quốc tế) chính thức đặt tên cho 4 nguyên tố mới, lấp đầy hàng cuối cùng của bảng: Nihonium (113, đặt theo "Nihon" — tên Nhật Bản trong tiếng Nhật), Moscovium (115, theo Moskva, Nga), Tennessine (117, theo bang Tennessee, Mỹ) và Oganesson (118, theo tên nhà vật lý hạt nhân Yuri Oganessian còn đang sống).',
      'Những nguyên tố này không tồn tại trong tự nhiên — chúng được tạo ra trong máy gia tốc hạt bằng cách bắn phá các nguyên tử nặng vào nhau, và chỉ tồn tại trong một phần rất nhỏ của giây trước khi phân rã. Có nguyên tố người ta chỉ tạo ra được vài nguyên tử trong suốt nhiều năm thí nghiệm.',
      'Oganesson đặc biệt vì là nguyên tố hiếm hoi được đặt tên khi người được vinh danh (Oganessian) vẫn còn sống — một vinh dự gần như chưa từng có trong lịch sử khoa học.'
    ],
    sourceLabel: 'Wikipedia — Oganesson',
    sourceUrl: 'https://en.wikipedia.org/wiki/Oganesson'
  },
  {
    id: 'newton-nha-gia-kim',
    category: 'history',
    icon: '🔮',
    title: 'Nhà vật lý vĩ đại nhất... cũng là một nhà giả kim thuật',
    summary: 'Isaac Newton dành nhiều thời gian nghiên cứu thuật giả kim hơn cả vật lý học.',
    body: [
      'Khi nhắc đến Isaac Newton, người ta nghĩ ngay đến định luật vạn vật hấp dẫn hay ba định luật chuyển động. Nhưng ít ai biết rằng Newton để lại hơn 1 triệu từ ghi chép về giả kim thuật — nhiều hơn hẳn số trang ông viết về vật lý — trong đó có các thí nghiệm tìm "hòn đá triết học" (được cho là có thể biến kim loại thường thành vàng).',
      'Vì giả kim thuật bị coi là bất hợp pháp ở Anh thời đó (sợ làm mất giá vàng thật), Newton phải giữ kín các nghiên cứu này suốt đời. Nhà kinh tế học John Maynard Keynes, người mua lại phần lớn bản thảo của Newton trong một cuộc đấu giá năm 1936, từng nhận xét: "Newton không phải người đầu tiên của Thời đại Lý trí — ông là nhà pháp sư vĩ đại cuối cùng."',
      'Dù không tìm ra cách biến chì thành vàng, chính những thí nghiệm tỉ mỉ với hoá chất trong quá trình theo đuổi giả kim thuật đã rèn cho Newton phương pháp thực nghiệm chặt chẽ — thứ ông sau này áp dụng vào vật lý học.'
    ],
    sourceLabel: 'Wikipedia — Isaac Newton\'s occult studies',
    sourceUrl: 'https://en.wikipedia.org/wiki/Isaac_Newton%27s_occult_studies'
  },
  {
    id: 'chi-ngot-ngao-la-ma-co-dai',
    category: 'history',
    icon: '🍷',
    title: 'Vị ngọt chết người trong ly rượu của người La Mã cổ đại',
    summary: 'Người La Mã cổ đại vô tình đầu độc chính mình bằng một chất phụ gia họ rất ưa chuộng.',
    body: [
      'Người La Mã cổ đại có một mẹo làm rượu ngon hơn: đun nước nho trong nồi chì (hoặc thêm bột chì acetate — khi đó gọi là "sapa" hay "defrutum") để tạo vị ngọt đậm mà không cần thêm đường. Họ không biết rằng hợp chất chì này có vị ngọt tự nhiên — và cực độc.',
      'Nhiều nhà sử học cho rằng việc tiêu thụ chì lâu dài qua rượu, ống dẫn nước, mỹ phẩm là một trong những nguyên nhân góp phần gây ra các vấn đề sức khoẻ, thậm chí được suy đoán liên quan đến sự suy tàn của một số tầng lớp quý tộc La Mã — dù đây vẫn là một giả thuyết còn tranh cãi trong giới sử học, không phải kết luận chắc chắn.',
      'Câu chuyện là lời nhắc sớm nhất trong lịch sử về ngộ độc kim loại nặng — một chủ đề mà mãi đến thế kỷ 20, khoa học mới hiểu đầy đủ và ban hành luật cấm chì trong xăng, sơn, ống nước.'
    ],
    sourceLabel: 'Wikipedia — Lead poisoning',
    sourceUrl: 'https://en.wikipedia.org/wiki/Lead_poisoning'
  },

  // ---------- Nhà hoá học nổi tiếng ----------
  {
    id: 'marie-curie-hai-giai-nobel',
    category: 'chemist',
    icon: '☢️',
    title: 'Người phụ nữ duy nhất đoạt Nobel ở hai lĩnh vực khoa học khác nhau',
    summary: 'Marie Curie làm việc trong một nhà kho dột nát để tìm ra 2 nguyên tố phóng xạ mới.',
    body: [
      'Marie Curie cùng chồng là Pierre Curie đã xử lý hàng tấn quặng uraninit trong một nhà kho cũ dột nát — vì các trường đại học Pháp thời đó không cấp phòng thí nghiệm tử tế cho một nhà khoa học nữ. Từ đống quặng đó, họ tìm ra hai nguyên tố hoàn toàn mới: polonium (đặt theo tên quê hương Ba Lan của bà) và radium.',
      'Bà đoạt giải Nobel Vật lý năm 1903 (chung với chồng) và giải Nobel Hoá học năm 1911 — đến nay vẫn là người duy nhất trong lịch sử đoạt giải Nobel ở hai lĩnh vực khoa học khác nhau.',
      'Cái giá phải trả rất lớn: bà qua đời năm 1934 vì một dạng bệnh máu được cho là liên quan đến việc phơi nhiễm phóng xạ kéo dài mà thời đó chưa ai hiểu rõ mức độ nguy hiểm. Đến tận ngày nay, sổ ghi chép thí nghiệm của bà vẫn còn nhiễm phóng xạ và phải bảo quản trong hộp chì tại Thư viện Quốc gia Pháp.'
    ],
    sourceLabel: 'Wikipedia — Marie Curie',
    sourceUrl: 'https://vi.wikipedia.org/wiki/Marie_Curie'
  },
  {
    id: 'mendeleev-giac-mo-bang-tuan-hoan',
    category: 'chemist',
    icon: '📊',
    title: 'Giấc mơ sắp xếp cả vũ trụ hoá học',
    summary: 'Mendeleev nói ông nhìn thấy bảng tuần hoàn hoàn chỉnh trong một giấc mơ.',
    body: [
      'Dmitri Mendeleev từng vật lộn nhiều ngày để tìm ra quy luật sắp xếp 63 nguyên tố đã biết vào thời của ông. Theo lời kể của chính ông, lời giải đến trong một giấc mơ năm 1869: ông thấy các nguyên tố tự xếp thành một bảng hoàn chỉnh theo khối lượng nguyên tử tăng dần. Tỉnh dậy, ông ghi lại ngay trên một mảnh giấy.',
      'Điều khiến bảng tuần hoàn của Mendeleev vượt trội hơn hẳn các bảng xếp hạng nguyên tố trước đó: ông dám để trống một số ô và tự tin dự đoán tính chất chi tiết của các nguyên tố CHƯA từng được tìm ra (ông gọi tạm là "eka-nhôm", "eka-silic"...). Vài năm sau, khi gali và germani được phát hiện, tính chất của chúng khớp gần như chính xác với những gì ông tiên đoán — biến bảng tuần hoàn từ một cách sắp xếp gọn gàng thành một công cụ dự báo khoa học thực sự.'
    ],
    sourceLabel: 'Wikipedia — Dmitri Ivanovich Mendeleev',
    sourceUrl: 'https://vi.wikipedia.org/wiki/Dmitri_Ivanovich_Mendeleev'
  },
  {
    id: 'nobel-thuoc-no-den-giai-hoa-binh',
    category: 'chemist',
    icon: '💣',
    title: 'Từ "người buôn cái chết" đến giải thưởng hoà bình',
    summary: 'Một bài cáo phó viết nhầm đã khiến Alfred Nobel thay đổi cả di chúc của mình.',
    body: [
      'Alfred Nobel là nhà hoá học phát minh ra dynamite — loại thuốc nổ ổn định và an toàn hơn nhiều so với nitroglycerin nguyên chất — và trở thành một trong những người giàu nhất châu Âu nhờ bán thuốc nổ, vũ khí cho nhiều quốc gia.',
      'Năm 1888, khi anh trai ông qua đời, một tờ báo Pháp đăng nhầm cáo phó của chính Alfred Nobel (tưởng ông mới là người mất), với dòng tít giật gân: "Người buôn cái chết đã chết" ("Le marchand de la mort est mort").',
      'Đọc được bài báo viết về chính "di sản" của mình ngay khi còn sống, Nobel bị sốc nặng và quyết định viết lại di chúc: dùng phần lớn tài sản để lập ra Giải Nobel — trong đó có Giải Nobel Hoà bình — để đời sau nhớ đến ông vì một lý do hoàn toàn khác với thuốc nổ.'
    ],
    sourceLabel: 'Wikipedia — Alfred Nobel',
    sourceUrl: 'https://vi.wikipedia.org/wiki/Alfred_Nobel'
  },
  {
    id: 'rosalind-franklin-anh-51',
    category: 'chemist',
    icon: '🧬',
    title: 'Tấm ảnh nhiễu xạ tia X làm thay đổi ngành sinh học',
    summary: 'Rosalind Franklin chụp được bức ảnh then chốt hé lộ cấu trúc xoắn kép của DNA.',
    body: [
      'Rosalind Franklin là nhà hoá học chuyên về kỹ thuật nhiễu xạ tia X. Năm 1952, phòng thí nghiệm của bà chụp được "Ảnh 51" — một bức ảnh nhiễu xạ tia X cực kỳ sắc nét của phân tử DNA, cho thấy rõ dấu hiệu của một cấu trúc xoắn kép.',
      'Bức ảnh này, cùng dữ liệu nghiên cứu của bà, được đồng nghiệp chia sẻ (không có sự đồng ý trực tiếp của Franklin) cho James Watson và Francis Crick — hai người sau đó công bố mô hình cấu trúc xoắn kép DNA nổi tiếng và giành giải Nobel Y học năm 1962.',
      'Rosalind Franklin qua đời năm 1958 vì ung thư buồng trứng, ở tuổi 37 — trước khi giải Nobel được trao (giải Nobel không trao cho người đã mất), nên vai trò then chốt của bà trong khám phá này chỉ được giới khoa học và công chúng ghi nhận đầy đủ nhiều năm sau đó.'
    ],
    sourceLabel: 'Wikipedia — Rosalind Franklin',
    sourceUrl: 'https://en.wikipedia.org/wiki/Rosalind_Franklin'
  },
  {
    id: 'linus-pauling-hai-giai-khong-chia-se',
    category: 'chemist',
    icon: '🕊️',
    title: 'Người duy nhất một mình ẵm trọn 2 giải Nobel',
    summary: 'Linus Pauling đoạt Nobel Hoá học rồi Nobel Hoà bình — không chia sẻ với ai.',
    body: [
      'Linus Pauling đoạt giải Nobel Hoá học năm 1954 cho các nghiên cứu về bản chất của liên kết hoá học — một trong những nền tảng của hoá học hiện đại. Trong khi Marie Curie đoạt 2 giải Nobel ở 2 lĩnh vực khác nhau (Vật lý và Hoá học), Pauling vẫn là người DUY NHẤT trong lịch sử đoạt trọn vẹn 2 giải Nobel mà không phải chia sẻ với bất kỳ ai ở cả hai lần.',
      'Giải thứ hai của ông, Nobel Hoà bình năm 1962, đến từ hoạt động vận động phản đối thử nghiệm vũ khí hạt nhân trên mặt đất — điều khiến ông từng bị chính phủ Mỹ tịch thu hộ chiếu trong giai đoạn Chiến tranh Lạnh vì bị nghi có liên hệ với cộng sản.',
      'Về cuối đời, Pauling gây tranh cãi khi quảng bá việc dùng liều cực cao vitamin C để chữa bệnh — một quan điểm phần lớn cộng đồng y khoa không đồng tình, cho thấy ngay cả một nhà khoa học vĩ đại cũng có thể sai ở một số lĩnh vực ngoài chuyên môn cốt lõi của mình.'
    ],
    sourceLabel: 'Wikipedia — Linus Pauling',
    sourceUrl: 'https://en.wikipedia.org/wiki/Linus_Pauling'
  },
  {
    id: 'fritz-haber-an-nhan-va-toi-do',
    category: 'chemist',
    icon: '🌾',
    title: 'Nhà hoá học vừa nuôi sống hàng tỷ người, vừa gây ra thảm hoạ',
    summary: 'Fritz Haber tìm ra cách "lấy phân bón từ không khí" — rồi dùng chính hoá học để làm vũ khí.',
    body: [
      'Đầu thế kỷ 20, Fritz Haber phát triển thành công quy trình tổng hợp amoniac trực tiếp từ khí nitơ trong không khí và khí hydro (sau này gọi là quy trình Haber-Bosch). Đây là bước đột phá cho phép sản xuất phân bón hoá học với quy mô công nghiệp, được xem là một trong những phát minh có ảnh hưởng lớn nhất giúp nhân loại tăng sản lượng lương thực và nuôi sống thêm hàng tỷ người trên Trái Đất. Ông đoạt giải Nobel Hoá học năm 1918 vì công trình này.',
      'Nhưng cũng chính Fritz Haber là người đứng đầu chương trình phát triển và triển khai vũ khí hoá học (khí clo) cho quân đội Đức trong Thế chiến I — trực tiếp giám sát đợt tấn công bằng khí độc đầu tiên trong lịch sử chiến tranh hiện đại năm 1915.',
      'Cuộc đời ông là một trong những ví dụ gây tranh cãi nhất trong lịch sử khoa học về ranh giới giữa việc phụng sự nhân loại và gây hại cho nhân loại — bằng chính một nền tảng kiến thức hoá học.'
    ],
    sourceLabel: 'Wikipedia — Fritz Haber',
    sourceUrl: 'https://en.wikipedia.org/wiki/Fritz_Haber'
  },
  {
    id: 'percy-julian-vuot-rao-can',
    category: 'chemist',
    icon: '🌱',
    title: 'Từ bị từ chối vì màu da đến một trong những nhà hoá học vĩ đại nhất nước Mỹ',
    summary: 'Percy Julian không được nhận vào phòng thí nghiệm vì phân biệt chủng tộc — rồi tự mở ra cả một ngành công nghiệp mới.',
    body: [
      'Percy Julian là nhà hoá học người Mỹ gốc Phi, lớn lên ở miền Nam nước Mỹ thời kỳ phân biệt chủng tộc còn rất nặng nề. Dù tốt nghiệp xuất sắc, nhiều trường đại học và phòng thí nghiệm ở Mỹ từ chối nhận ông làm giảng viên chính thức hoặc cấp cho ông phòng thí nghiệm riêng chỉ vì màu da.',
      'Ông vẫn kiên trì theo đuổi nghiên cứu và trở thành người đầu tiên tổng hợp thành công cortisone và một số hormone steroid quan trọng từ đậu nành với chi phí rẻ hơn rất nhiều so với chiết xuất tự nhiên — mở đường cho việc sản xuất thuốc điều trị viêm khớp và nhiều bệnh khác với giá cả phải chăng cho hàng triệu người.',
      'Percy Julian sau này được bầu vào Viện Hàn lâm Khoa học Quốc gia Mỹ và giữ hơn 130 bằng sáng chế — một trong những minh chứng rõ ràng nhất rằng rào cản xã hội không thể ngăn được một bộ óc khoa học kiên trì.'
    ],
    sourceLabel: 'Wikipedia — Percy Lavon Julian',
    sourceUrl: 'https://en.wikipedia.org/wiki/Percy_Lavon_Julian'
  },

  // ---------- Phát minh vĩ đại ----------
  {
    id: 'teflon-tu-mot-sai-sot',
    category: 'invention',
    icon: '🍳',
    title: 'Phát minh vĩ đại nhất... từ một bình gas bị "hỏng"',
    summary: 'Roy Plunkett cưa đôi một bình khí không xì ra khí nữa — và tìm thấy Teflon.',
    body: [
      'Năm 1938, kỹ sư hoá học trẻ Roy Plunkett đang nghiên cứu một loại khí làm lạnh mới tại DuPont. Một bình khí ông đang dùng bỗng dưng không còn xì khí ra nữa dù cân vẫn thấy bình còn nặng như lúc đầy.',
      'Tò mò thay vì vứt bỏ, ông cưa đôi bình ra và phát hiện bên trong là một lớp bột trắng trơn bất thường — khí đã tự polyme hoá thành một chất hoàn toàn mới, không dính, chịu nhiệt và hoá chất cực tốt. Đó chính là PTFE, sau này được biết đến rộng rãi với tên thương mại Teflon.',
      'Ban đầu Teflon chủ yếu được dùng trong công nghiệp và chương trình vũ khí hạt nhân (do khả năng chống ăn mòn cực cao). Phải đến gần 20 năm sau, một kỹ sư Pháp mới nghĩ ra cách phủ nó lên chảo nấu ăn — tạo ra chiếc chảo chống dính đầu tiên mà rất nhiều gia đình vẫn dùng mỗi ngày.'
    ],
    sourceLabel: 'Wikipedia — Polytetrafluoroethylene',
    sourceUrl: 'https://en.wikipedia.org/wiki/Polytetrafluoroethylene'
  },
  {
    id: 'perkin-mau-tim-mauveine',
    category: 'invention',
    icon: '🎨',
    title: 'Cậu sinh viên 18 tuổi tình cờ nhuộm cả thế giới thời trang',
    summary: 'William Perkin đang cố tổng hợp thuốc chống sốt rét thì tạo ra thuốc nhuộm tổng hợp đầu tiên trên thế giới.',
    body: [
      'Năm 1856, William Perkin, một sinh viên hoá học 18 tuổi ở London, được giao nhiệm vụ tìm cách tổng hợp quinine (thuốc chống sốt rét) trong phòng thí nghiệm tại nhà vào kỳ nghỉ lễ Phục Sinh. Thí nghiệm của ông thất bại — nhưng để lại một chất cặn màu tím sẫm kỳ lạ trong ống nghiệm.',
      'Thay vì đổ bỏ, Perkin nhận ra chất này có thể nhuộm vải rất bền màu. Trước đó, màu tím (mauve) chỉ chiết xuất được từ một loài ốc biển hiếm, cực kỳ đắt đỏ, chỉ giới quý tộc mới dùng nổi. Chất mới của Perkin — đặt tên mauveine — cho phép sản xuất màu tím hàng loạt với giá rẻ.',
      'Perkin bỏ học, xin bằng sáng chế và mở nhà máy sản xuất thuốc nhuộm khi mới 18 tuổi, trở thành triệu phú và khai sinh ra cả ngành công nghiệp hoá chất hữu cơ tổng hợp hiện đại — chỉ vì một thí nghiệm chống sốt rét thất bại.'
    ],
    sourceLabel: 'Wikipedia — William Henry Perkin',
    sourceUrl: 'https://en.wikipedia.org/wiki/William_Henry_Perkin'
  },
  {
    id: 'aspirin-tu-vo-cay-lieu',
    category: 'invention',
    icon: '💊',
    title: 'Viên thuốc giảm đau phổ biến nhất hành tinh, ra đời từ vỏ cây',
    summary: 'Con người biết vỏ cây liễu giảm đau từ hàng ngàn năm trước — nhưng phải đến 1897 mới có aspirin.',
    body: [
      'Từ thời Ai Cập cổ đại và Hy Lạp cổ đại, con người đã biết nhai vỏ cây liễu hoặc sắc nước uống để giảm đau, hạ sốt — nhờ một hợp chất tự nhiên tên salicin. Vấn đề là salicin (và acid salicylic chiết xuất từ nó) gây kích ứng dạ dày rất nặng nếu dùng liều đủ mạnh để giảm đau.',
      'Năm 1897, nhà hoá học Felix Hoffmann, làm việc cho hãng dược Bayer (Đức), đã tổng hợp thành công một dạng biến đổi của acid salicylic — acetylsalicylic acid — vừa giữ được tác dụng giảm đau, hạ sốt, chống viêm, vừa dịu nhẹ hơn nhiều với dạ dày. Bayer đặt tên thương mại là Aspirin.',
      'Hơn 100 năm sau, aspirin vẫn là một trong những loại thuốc được dùng rộng rãi nhất thế giới, và các nhà khoa học vẫn tiếp tục tìm ra thêm những công dụng mới của nó, như hỗ trợ phòng ngừa một số bệnh tim mạch với liều thấp.'
    ],
    sourceLabel: 'Wikipedia — Aspirin',
    sourceUrl: 'https://en.wikipedia.org/wiki/Aspirin'
  },
  {
    id: 'nylon-to-nhan-tao',
    category: 'invention',
    icon: '🧵',
    title: 'Sợi tơ đầu tiên "mạnh hơn thép, mảnh hơn tơ nhện"',
    summary: 'Nylon ra đời từ phòng thí nghiệm DuPont, mở ra cả một thời đại vật liệu polymer tổng hợp.',
    body: [
      'Năm 1935, nhà hoá học Wallace Carothers cùng nhóm nghiên cứu tại DuPont tổng hợp thành công một loại polymer mới có thể kéo thành sợi cực bền — được quảng cáo khi ra mắt năm 1938 với câu nổi tiếng: "mạnh như thép, mảnh như tơ nhện". Đó chính là nylon, loại sợi tổng hợp hoàn toàn từ hoá dầu đầu tiên trên thế giới, không lấy từ bất kỳ nguồn gốc thực vật hay động vật nào.',
      'Sản phẩm thương mại đầu tiên gây sốt là tất nylon cho phụ nữ, ra mắt năm 1940 và bán hết veo trong vài giờ. Trong Thế chiến II, toàn bộ sản lượng nylon được chuyển sang phục vụ quân sự (dù dù nhảy, dây thừng, lốp xe), khiến tất nylon trở nên khan hiếm đến mức từng gây ra "bạo loạn nylon" ở một số thành phố Mỹ khi chiến tranh kết thúc và nguồn cung quay lại thị trường dân dụng.',
      'Đáng buồn là Wallace Carothers qua đời năm 1937 do tự tử, một năm trước khi phát minh của ông thực sự ra mắt công chúng và làm thay đổi ngành dệt may toàn cầu.'
    ],
    sourceLabel: 'Wikipedia — Nylon',
    sourceUrl: 'https://en.wikipedia.org/wiki/Nylon'
  },
  {
    id: 'kwolek-kevlar',
    category: 'invention',
    icon: '🛡️',
    title: 'Dung dịch "hỏng" mà không ai nỡ đổ đi',
    summary: 'Stephanie Kwolek phát hiện một dung dịch polymer kỳ lạ — và tạo ra vật liệu chống đạn Kevlar.',
    body: [
      'Năm 1965, nhà hoá học Stephanie Kwolek, làm việc tại DuPont, đang nghiên cứu tìm loại sợi polymer nhẹ nhưng bền để thay lốp xe kim loại trong bối cảnh lo ngại khủng hoảng nhiên liệu. Một mẻ dung dịch polymer bà pha ra có biểu hiện rất khác thường: đục, loãng hơn bình thường — theo tiêu chuẩn lúc đó, trông giống như một mẻ hỏng cần đổ bỏ.',
      'Thay vì bỏ đi, Kwolek thuyết phục đồng nghiệp vận hành máy kéo sợi thử dung dịch "kỳ lạ" đó. Kết quả là một loại sợi có độ bền kéo cao gấp nhiều lần thép cùng khối lượng. Đó chính là tiền thân của Kevlar — vật liệu sau này được dùng trong áo giáp chống đạn, mũ bảo hộ, lốp xe, cáp treo và hàng trăm ứng dụng công nghiệp khác.',
      'Kevlar được ước tính đã cứu sống hàng chục ngàn cảnh sát và binh sĩ trên khắp thế giới nhờ áo giáp chống đạn — tất cả bắt đầu từ một dung dịch mà theo lẽ thường sẽ bị đổ bỏ ngay lập tức.'
    ],
    sourceLabel: 'Wikipedia — Stephanie Kwolek',
    sourceUrl: 'https://en.wikipedia.org/wiki/Stephanie_Kwolek'
  },
  {
    id: 'goodyear-cao-su-luu-hoa',
    category: 'invention',
    icon: '🔥',
    title: 'Làm rơi hoá chất lên bếp nóng — và cứu cả ngành công nghiệp cao su',
    summary: 'Charles Goodyear theo đuổi giấc mơ cải tiến cao su suốt nhiều năm phá sản, rồi tình cờ tìm ra lời giải.',
    body: [
      'Đầu thế kỷ 19, cao su tự nhiên có một nhược điểm chết người: mùa hè thì chảy nhão dính bết, mùa đông thì cứng giòn và nứt vỡ, khiến nó gần như vô dụng để sản xuất hàng hoá bền lâu. Charles Goodyear ám ảnh với việc tìm ra cách khắc phục điều này, đến mức khiến gia đình ông rơi vào cảnh nợ nần, thậm chí có lúc ông phải vào tù vì nợ.',
      'Năm 1839, trong một lần thử nghiệm, ông vô tình làm rơi một mẩu cao su đã trộn lưu huỳnh lên mặt bếp lò đang nóng. Thay vì chảy nhão như mọi khi, mẩu cao su đó lại cháy xém nhẹ nhưng vẫn giữ được độ đàn hồi ổn định ở cả nhiệt độ cao lẫn khi để nguội. Đó chính là quá trình "lưu hoá" cao su — biến cao su tự nhiên thành vật liệu bền, đàn hồi, chịu được cả nóng lẫn lạnh.',
      'Phát minh này mở đường cho hàng loạt ứng dụng công nghiệp về sau, đặc biệt là lốp xe hơi. Trớ trêu, chính Charles Goodyear lại qua đời trong cảnh nợ nần vì tranh chấp bằng sáng chế — công ty lốp xe Goodyear nổi tiếng ngày nay được đặt theo tên ông để tưởng nhớ, nhưng không phải do gia đình ông sáng lập.'
    ],
    sourceLabel: 'Wikipedia — Charles Goodyear',
    sourceUrl: 'https://en.wikipedia.org/wiki/Charles_Goodyear'
  },
  {
    id: 'diem-an-toan',
    category: 'invention',
    icon: '🔥',
    title: 'Từ que diêm có thể đầu độc người thợ làm ra nó, đến que diêm trong bếp nhà bạn',
    summary: 'Hành trình gian nan để biến một phát minh tiện lợi nhưng cực độc thành vật dụng an toàn hằng ngày.',
    body: [
      'Những que diêm tự bắt lửa đầu tiên, phổ biến từ đầu thế kỷ 19, dùng phốt pho trắng — một chất dễ cháy nhưng cực độc. Công nhân làm việc nhiều năm trong các xưởng sản xuất diêm thường mắc phải một căn bệnh khủng khiếp gọi là "hàm hoại tử phốt pho" (phossy jaw) do hít phải hơi phốt pho trắng lâu ngày, khiến xương hàm bị hoại tử.',
      'Nhiều nhà hoá học sau đó tìm cách thay thế phốt pho trắng bằng phốt pho đỏ — kém độc hơn nhiều và chỉ bắt lửa khi cọ xát đúng vào một bề mặt hoá chất đặc biệt (thường là ở cạnh hộp diêm) thay vì bắt lửa bất cứ đâu. Đó chính là nguyên lý của "diêm an toàn" (safety match) mà chúng ta vẫn dùng ngày nay.',
      'Phải đến đầu thế kỷ 20, nhiều quốc gia mới ban hành luật cấm hẳn diêm phốt pho trắng sau các chiến dịch đấu tranh của công nhân và bác sĩ — một trong những ví dụ sớm về việc hoá học công nghiệp phải nhường bước trước sức khoẻ người lao động.'
    ],
    sourceLabel: 'Wikipedia — Match',
    sourceUrl: 'https://en.wikipedia.org/wiki/Match'
  }
];
