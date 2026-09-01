// Dữ liệu 118 nguyên tố hoá học.
// cat: alkali | alkaline | lanthanide | actinide | transition | post | metalloid | nonmetal | halogen | noble
// Khối lượng nguyên tử theo IUPAC (làm tròn); nhiệt độ tính theo °C; khối lượng riêng theo g/cm3 (khí đo ở g/L, ghi chú "(khí)").
const ELEMENTS = [
{z:1,sym:'H',vi:'Hiđro',en:'Hydrogen',mass:1.008,cat:'nonmetal',period:1,group:1,config:'1s1',density:0.09,densityUnit:'g/L (khí)',melt:-259.1,boil:-252.9,summary:'Nguyên tố nhẹ nhất và phổ biến nhất vũ trụ. Dùng làm nhiên liệu tên lửa, sản xuất amoniac (NH3), hiđro hoá dầu thực vật.'},
{z:2,sym:'He',vi:'Heli',en:'Helium',mass:4.003,cat:'noble',period:1,group:18,config:'1s2',density:0.18,densityUnit:'g/L (khí)',melt:-272.2,boil:-268.9,summary:'Khí hiếm nhẹ thứ hai, trơ về hoá học. Dùng bơm bóng bay, làm lạnh sâu (MRI), khí bảo vệ khi hàn.'},
{z:3,sym:'Li',vi:'Liti',en:'Lithium',mass:6.94,cat:'alkali',period:2,group:1,config:'[He] 2s1',density:0.53,melt:180.5,boil:1342,summary:'Kim loại kiềm nhẹ nhất. Thành phần chính của pin sạc lithium-ion, một số thuốc điều trị rối loạn lưỡng cực.'},
{z:4,sym:'Be',vi:'Beri',en:'Beryllium',mass:9.012,cat:'alkaline',period:2,group:2,config:'[He] 2s2',density:1.85,melt:1287,boil:2469,summary:'Kim loại kiềm thổ nhẹ, cứng, độc. Dùng trong hợp kim hàng không vũ trụ và cửa sổ ống tia X.'},
{z:5,sym:'B',vi:'Bo',en:'Boron',mass:10.81,cat:'metalloid',period:2,group:13,config:'[He] 2s2 2p1',density:2.34,melt:2076,boil:3927,summary:'Á kim dùng trong thuỷ tinh borosilicat (chịu nhiệt), sợi bo cường lực cao, chất khử trong luyện kim.'},
{z:6,sym:'C',vi:'Cacbon',en:'Carbon',mass:12.011,cat:'nonmetal',period:2,group:14,config:'[He] 2s2 2p2',density:2.27,melt:3550,boil:4027,summary:'Nền tảng của hoá hữu cơ và sự sống. Tồn tại dạng kim cương, than chì, than hoạt tính; thành phần chính của thép (dạng cacbua).'},
{z:7,sym:'N',vi:'Nitơ',en:'Nitrogen',mass:14.007,cat:'nonmetal',period:2,group:15,config:'[He] 2s2 2p3',density:1.25,densityUnit:'g/L (khí)',melt:-210.1,boil:-195.8,summary:'Chiếm 78% khí quyển. Nguyên liệu sản xuất amoniac, phân đạm, thuốc nổ; khí N2 lỏng dùng bảo quản lạnh sâu.'},
{z:8,sym:'O',vi:'Oxi',en:'Oxygen',mass:15.999,cat:'nonmetal',period:2,group:16,config:'[He] 2s2 2p4',density:1.43,densityUnit:'g/L (khí)',melt:-218.8,boil:-183,summary:'Cần thiết cho hô hấp và sự cháy. Chiếm 21% khí quyển, dùng trong y tế, luyện thép, hàn cắt kim loại.'},
{z:9,sym:'F',vi:'Flo',en:'Fluorine',mass:18.998,cat:'halogen',period:2,group:17,config:'[He] 2s2 2p5',density:1.70,densityUnit:'g/L (khí)',melt:-219.6,boil:-188.1,summary:'Halogen có độ âm điện lớn nhất, phản ứng mạnh nhất. Dùng trong kem đánh răng (NaF), Teflon, làm giàu urani (UF6).'},
{z:10,sym:'Ne',vi:'Neon',en:'Neon',mass:20.180,cat:'noble',period:2,group:18,config:'[He] 2s2 2p6',density:0.90,densityUnit:'g/L (khí)',melt:-248.6,boil:-246.1,summary:'Khí hiếm trơ, phát ánh sáng đỏ cam đặc trưng khi phóng điện. Dùng làm biển hiệu neon.'},
{z:11,sym:'Na',vi:'Natri',en:'Sodium',mass:22.990,cat:'alkali',period:3,group:1,config:'[Ne] 3s1',density:0.97,melt:97.8,boil:883,summary:'Kim loại kiềm mềm, phản ứng mạnh với nước. Thành phần muối ăn (NaCl), xà phòng, đèn hơi natri.'},
{z:12,sym:'Mg',vi:'Magie',en:'Magnesium',mass:24.305,cat:'alkaline',period:3,group:2,config:'[Ne] 3s2',density:1.74,melt:650,boil:1090,summary:'Kim loại nhẹ, cháy sáng chói. Dùng trong hợp kim hàng không, pháo hoa, có trong diệp lục của thực vật.'},
{z:13,sym:'Al',vi:'Nhôm',en:'Aluminium',mass:26.982,cat:'post',period:3,group:13,config:'[Ne] 3s2 3p1',density:2.70,melt:660.3,boil:2519,summary:'Kim loại nhẹ, chống ăn mòn nhờ lớp oxit bảo vệ. Dùng làm vỏ máy bay, đồ gia dụng, dây điện.'},
{z:14,sym:'Si',vi:'Silic',en:'Silicon',mass:28.085,cat:'metalloid',period:3,group:14,config:'[Ne] 3s2 3p2',density:2.33,melt:1414,boil:3265,summary:'Á kim phổ biến thứ hai trong vỏ Trái Đất. Nền tảng của chip bán dẫn, pin mặt trời, thuỷ tinh.'},
{z:15,sym:'P',vi:'Photpho',en:'Phosphorus',mass:30.974,cat:'nonmetal',period:3,group:15,config:'[Ne] 3s2 3p3',density:1.82,melt:44.1,boil:280.5,summary:'Có dạng trắng (độc, phát quang) và đỏ (bền hơn). Thành phần phân lân, diêm, ADN/ATP trong cơ thể.'},
{z:16,sym:'S',vi:'Lưu huỳnh',en:'Sulfur',mass:32.06,cat:'nonmetal',period:3,group:16,config:'[Ne] 3s2 3p4',density:2.07,melt:115.2,boil:444.6,summary:'Phi kim màu vàng. Nguyên liệu sản xuất axit sunfuric (H2SO4), lưu hoá cao su, thuốc trừ sâu.'},
{z:17,sym:'Cl',vi:'Clo',en:'Chlorine',mass:35.45,cat:'halogen',period:3,group:17,config:'[Ne] 3s2 3p5',density:3.21,densityUnit:'g/L (khí)',melt:-101.5,boil:-34,summary:'Khí độc màu vàng lục. Dùng khử trùng nước sinh hoạt, sản xuất PVC, chất tẩy trắng.'},
{z:18,sym:'Ar',vi:'Agon',en:'Argon',mass:39.948,cat:'noble',period:3,group:18,config:'[Ne] 3s2 3p6',density:1.78,densityUnit:'g/L (khí)',melt:-189.3,boil:-185.8,summary:'Khí hiếm chiếm ~1% khí quyển. Dùng làm khí bảo vệ khi hàn, khí nạp bóng đèn sợi đốt.'},
{z:19,sym:'K',vi:'Kali',en:'Potassium',mass:39.098,cat:'alkali',period:4,group:1,config:'[Ar] 4s1',density:0.86,melt:63.4,boil:759,summary:'Kim loại kiềm thiết yếu cho cơ thể (dẫn truyền thần kinh). Thành phần chính phân kali (bón cây).'},
{z:20,sym:'Ca',vi:'Canxi',en:'Calcium',mass:40.078,cat:'alkaline',period:4,group:2,config:'[Ar] 4s2',density:1.55,melt:842,boil:1484,summary:'Thành phần chính của xương, răng, đá vôi (CaCO3). Dùng sản xuất xi măng, vôi sống.'},
{z:21,sym:'Sc',vi:'Scandi',en:'Scandium',mass:44.956,cat:'transition',period:4,group:3,config:'[Ar] 3d1 4s2',density:2.99,melt:1541,boil:2836,summary:'Kim loại chuyển tiếp nhẹ, hiếm. Dùng trong hợp kim nhôm-scandi cho khung xe đạp, hàng không.'},
{z:22,sym:'Ti',vi:'Titan',en:'Titanium',mass:47.867,cat:'transition',period:4,group:4,config:'[Ar] 3d2 4s2',density:4.51,melt:1668,boil:3287,summary:'Nhẹ, bền, chống ăn mòn. Dùng trong cấy ghép y tế, khung máy bay, sơn trắng (TiO2).'},
{z:23,sym:'V',vi:'Vanadi',en:'Vanadium',mass:50.942,cat:'transition',period:4,group:5,config:'[Ar] 3d3 4s2',density:6.11,melt:1910,boil:3407,summary:'Tăng độ bền cho thép hợp kim. Dùng trong pin dòng chảy vanadi (lưu trữ năng lượng).'},
{z:24,sym:'Cr',vi:'Crom',en:'Chromium',mass:51.996,cat:'transition',period:4,group:6,config:'[Ar] 3d5 4s1',density:7.15,melt:1907,boil:2671,summary:'Cứng, chống ăn mòn, sáng bóng. Dùng mạ crom, hợp kim thép không gỉ (inox).'},
{z:25,sym:'Mn',vi:'Mangan',en:'Manganese',mass:54.938,cat:'transition',period:4,group:7,config:'[Ar] 3d5 4s2',density:7.44,melt:1246,boil:2061,summary:'Thiết yếu trong luyện thép (tăng độ cứng). Dùng trong pin khô, phân bón vi lượng.'},
{z:26,sym:'Fe',vi:'Sắt',en:'Iron',mass:55.845,cat:'transition',period:4,group:8,config:'[Ar] 3d6 4s2',density:7.87,melt:1538,boil:2862,summary:'Kim loại được sử dụng nhiều nhất thế giới. Thành phần chính của thép, gang; có trong hemoglobin máu.'},
{z:27,sym:'Co',vi:'Coban',en:'Cobalt',mass:58.933,cat:'transition',period:4,group:9,config:'[Ar] 3d7 4s2',density:8.86,melt:1495,boil:2927,summary:'Dùng trong pin lithium-ion, nam châm mạnh (AlNiCo), men sứ màu xanh coban.'},
{z:28,sym:'Ni',vi:'Niken',en:'Nickel',mass:58.693,cat:'transition',period:4,group:10,config:'[Ar] 3d8 4s2',density:8.91,melt:1455,boil:2913,summary:'Chống ăn mòn tốt. Dùng mạ kim loại, hợp kim inox, pin sạc NiMH.'},
{z:29,sym:'Cu',vi:'Đồng',en:'Copper',mass:63.546,cat:'transition',period:4,group:11,config:'[Ar] 3d10 4s1',density:8.96,melt:1084.6,boil:2562,summary:'Dẫn điện, dẫn nhiệt tốt (chỉ sau bạc). Dùng làm dây điện, ống nước, hợp kim đồng thau/đồng thanh.'},
{z:30,sym:'Zn',vi:'Kẽm',en:'Zinc',mass:65.38,cat:'transition',period:4,group:12,config:'[Ar] 3d10 4s2',density:7.13,melt:419.5,boil:907,summary:'Dùng mạ chống gỉ cho sắt thép (tôn kẽm), hợp kim đồng thau, vi chất dinh dưỡng thiết yếu.'},
{z:31,sym:'Ga',vi:'Gali',en:'Gallium',mass:69.723,cat:'post',period:4,group:13,config:'[Ar] 3d10 4s2 4p1',density:5.91,melt:29.8,boil:2204,summary:'Nóng chảy ngay trong lòng bàn tay. Dùng trong chất bán dẫn (GaAs, GaN) cho LED và IC tốc độ cao.'},
{z:32,sym:'Ge',vi:'Gecmani',en:'Germanium',mass:72.63,cat:'metalloid',period:4,group:14,config:'[Ar] 3d10 4s2 4p2',density:5.32,melt:938.3,boil:2833,summary:'Á kim bán dẫn, trong suốt với tia hồng ngoại. Dùng trong ống kính hồng ngoại, sợi quang.'},
{z:33,sym:'As',vi:'Asen',en:'Arsenic',mass:74.922,cat:'metalloid',period:4,group:15,config:'[Ar] 3d10 4s2 4p3',density:5.78,melt:817,boil:614,summary:'Á kim độc. Dùng (với liều kiểm soát) trong chất bán dẫn GaAs, trước đây dùng làm thuốc trừ sâu.'},
{z:34,sym:'Se',vi:'Selen',en:'Selenium',mass:78.971,cat:'nonmetal',period:4,group:16,config:'[Ar] 3d10 4s2 4p4',density:4.81,melt:221,boil:685,summary:'Nguyên tố vi lượng thiết yếu. Dùng trong pin mặt trời, máy photocopy (tính quang dẫn).'},
{z:35,sym:'Br',vi:'Brom',en:'Bromine',mass:79.904,cat:'halogen',period:4,group:17,config:'[Ar] 3d10 4s2 4p5',density:3.10,melt:-7.2,boil:58.8,summary:'Halogen duy nhất ở thể lỏng tại nhiệt độ phòng, màu nâu đỏ, mùi hắc. Dùng trong thuốc, chất chống cháy.'},
{z:36,sym:'Kr',vi:'Krypton',en:'Krypton',mass:83.798,cat:'noble',period:4,group:18,config:'[Ar] 3d10 4s2 4p6',density:3.75,densityUnit:'g/L (khí)',melt:-157.4,boil:-153.4,summary:'Khí hiếm dùng trong đèn flash chụp ảnh, đèn khí phóng điện, ổn định laser.'},
{z:37,sym:'Rb',vi:'Rubidi',en:'Rubidium',mass:85.468,cat:'alkali',period:5,group:1,config:'[Kr] 5s1',density:1.53,melt:39.3,boil:688,summary:'Kim loại kiềm mềm, phản ứng mạnh với nước. Dùng trong đồng hồ nguyên tử, nghiên cứu vật lý lượng tử.'},
{z:38,sym:'Sr',vi:'Stronti',en:'Strontium',mass:87.62,cat:'alkaline',period:5,group:2,config:'[Kr] 5s2',density:2.64,melt:777,boil:1382,summary:'Muối stronti cho pháo hoa màu đỏ. Đồng vị Sr-90 dùng trong nguồn phóng xạ; hợp chất dùng trong kem đánh răng chống ê buốt.'},
{z:39,sym:'Y',vi:'Ytri',en:'Yttrium',mass:88.906,cat:'transition',period:5,group:3,config:'[Kr] 4d1 5s2',density:4.47,melt:1526,boil:3345,summary:'Dùng trong đèn LED (phốt pho YAG), siêu dẫn nhiệt độ cao, hợp kim nhẹ.'},
{z:40,sym:'Zr',vi:'Zirconi',en:'Zirconium',mass:91.224,cat:'transition',period:5,group:4,config:'[Kr] 4d2 5s2',density:6.52,melt:1855,boil:4409,summary:'Chống ăn mòn cực tốt. Dùng làm vỏ bọc thanh nhiên liệu lò phản ứng hạt nhân, đá zirconi giả kim cương.'},
{z:41,sym:'Nb',vi:'Niobi',en:'Niobium',mass:92.906,cat:'transition',period:5,group:5,config:'[Kr] 4d4 5s1',density:8.57,melt:2477,boil:4744,summary:'Dùng trong nam châm siêu dẫn (máy MRI, máy gia tốc hạt), hợp kim thép cường độ cao.'},
{z:42,sym:'Mo',vi:'Molypden',en:'Molybdenum',mass:95.95,cat:'transition',period:5,group:6,config:'[Kr] 4d5 5s1',density:10.28,melt:2623,boil:4639,summary:'Tăng độ bền nhiệt cho thép hợp kim. Dùng trong dây tóc bóng đèn, chất xúc tác lọc dầu.'},
{z:43,sym:'Tc',vi:'Tecneti',en:'Technetium',mass:98,cat:'transition',period:5,group:7,config:'[Kr] 4d5 5s2',density:11.0,melt:2157,boil:4265,summary:'Nguyên tố phóng xạ nhân tạo đầu tiên được tổng hợp. Đồng vị Tc-99m dùng phổ biến trong chẩn đoán hình ảnh y học hạt nhân.'},
{z:44,sym:'Ru',vi:'Rutheni',en:'Ruthenium',mass:101.07,cat:'transition',period:5,group:8,config:'[Kr] 4d7 5s1',density:12.45,melt:2334,boil:4150,summary:'Kim loại quý hiếm. Dùng làm chất xúc tác, tiếp điểm điện, hợp kim với bạch kim.'},
{z:45,sym:'Rh',vi:'Rodi',en:'Rhodium',mass:102.906,cat:'transition',period:5,group:9,config:'[Kr] 4d8 5s1',density:12.41,melt:1964,boil:3695,summary:'Kim loại quý, phản chiếu tốt, chống ăn mòn. Thành phần chính trong bộ chuyển đổi xúc tác ô tô.'},
{z:46,sym:'Pd',vi:'Paladi',en:'Palladium',mass:106.42,cat:'transition',period:5,group:10,config:'[Kr] 4d10',density:12.02,melt:1554.9,boil:2963,summary:'Hấp thụ hiđro rất tốt. Dùng trong bộ chuyển đổi xúc tác, trang sức, linh kiện điện tử.'},
{z:47,sym:'Ag',vi:'Bạc',en:'Silver',mass:107.868,cat:'transition',period:5,group:11,config:'[Kr] 4d10 5s1',density:10.49,melt:961.8,boil:2162,summary:'Dẫn điện, dẫn nhiệt tốt nhất trong các kim loại. Dùng làm trang sức, tiếp điểm điện, kháng khuẩn.'},
{z:48,sym:'Cd',vi:'Cadimi',en:'Cadmium',mass:112.414,cat:'transition',period:5,group:12,config:'[Kr] 4d10 5s2',density:8.65,melt:321.1,boil:767,summary:'Kim loại độc. Trước đây dùng trong pin Ni-Cd, chất tạo màu vàng/đỏ trong sơn và nhựa.'},
{z:49,sym:'In',vi:'Indi',en:'Indium',mass:114.818,cat:'post',period:5,group:13,config:'[Kr] 4d10 5s2 5p1',density:7.31,melt:156.6,boil:2072,summary:'Dùng trong lớp phủ dẫn điện trong suốt ITO cho màn hình cảm ứng và tấm pin mặt trời.'},
{z:50,sym:'Sn',vi:'Thiếc',en:'Tin',mass:118.71,cat:'post',period:5,group:14,config:'[Kr] 4d10 5s2 5p2',density:7.31,melt:231.9,boil:2602,summary:'Chống ăn mòn tốt. Dùng mạ hộp thiếc đựng thực phẩm, hợp kim hàn, đồng thanh (với đồng).'},
{z:51,sym:'Sb',vi:'Antimon',en:'Antimony',mass:121.76,cat:'metalloid',period:5,group:15,config:'[Kr] 4d10 5s2 5p3',density:6.68,melt:630.6,boil:1587,summary:'Á kim dùng trong hợp kim chữ in, ắc quy chì-axit, chất chống cháy cho nhựa và vải.'},
{z:52,sym:'Te',vi:'Telu',en:'Tellurium',mass:127.6,cat:'metalloid',period:5,group:16,config:'[Kr] 4d10 5s2 5p4',density:6.24,melt:449.5,boil:988,summary:'Á kim hiếm. Dùng trong pin mặt trời màng mỏng (CdTe), hợp kim thép dễ gia công.'},
{z:53,sym:'I',vi:'Iot',en:'Iodine',mass:126.904,cat:'halogen',period:5,group:17,config:'[Kr] 4d10 5s2 5p5',density:4.93,melt:113.7,boil:184.3,summary:'Chất rắn tím thăng hoa. Thiết yếu cho tuyến giáp, dùng bổ sung vào muối iot, sát trùng vết thương.'},
{z:54,sym:'Xe',vi:'Xenon',en:'Xenon',mass:131.293,cat:'noble',period:5,group:18,config:'[Kr] 4d10 5s2 5p6',density:5.9,densityUnit:'g/L (khí)',melt:-111.8,boil:-108,summary:'Khí hiếm nặng. Dùng trong đèn xenon (đèn pha ô tô, đèn chiếu), gây mê, động cơ đẩy ion vệ tinh.'},
{z:55,sym:'Cs',vi:'Xesi',en:'Caesium',mass:132.905,cat:'alkali',period:6,group:1,config:'[Xe] 6s1',density:1.93,melt:28.4,boil:671,summary:'Kim loại kiềm phản ứng mạnh nhất, nóng chảy gần nhiệt độ phòng. Chuẩn định nghĩa giây trong đồng hồ nguyên tử Cs-133.'},
{z:56,sym:'Ba',vi:'Bari',en:'Barium',mass:137.327,cat:'alkaline',period:6,group:2,config:'[Xe] 6s2',density:3.51,melt:727,boil:1897,summary:'Hợp chất BaSO4 dùng làm chất cản quang khi chụp X-quang đường tiêu hoá; muối bari tạo màu xanh lá cho pháo hoa.'},
{z:57,sym:'La',vi:'Lantan',en:'Lanthanum',mass:138.905,cat:'lanthanide',period:6,group:3,config:'[Xe] 5d1 6s2',density:6.15,melt:920,boil:3464,summary:'Nguyên tố mở đầu dãy lantan (đất hiếm). Dùng trong ống kính máy ảnh chiết suất cao, điện cực pin NiMH.'},
{z:58,sym:'Ce',vi:'Xeri',en:'Cerium',mass:140.116,cat:'lanthanide',period:6,group:3,config:'[Xe] 4f1 5d1 6s2',density:6.77,melt:798,boil:3443,summary:'Đất hiếm phổ biến nhất. Dùng làm đá lửa bật lửa (hợp kim ferroceri), chất đánh bóng thuỷ tinh.'},
{z:59,sym:'Pr',vi:'Praseodymi',en:'Praseodymium',mass:140.908,cat:'lanthanide',period:6,group:3,config:'[Xe] 4f3 6s2',density:6.77,melt:931,boil:3520,summary:'Đất hiếm tạo màu vàng lục cho kính hàn, thuỷ tinh và nam châm mạnh hợp kim với neodymi.'},
{z:60,sym:'Nd',vi:'Neodymi',en:'Neodymium',mass:144.242,cat:'lanthanide',period:6,group:3,config:'[Xe] 4f4 6s2',density:7.01,melt:1021,boil:3074,summary:'Thành phần nam châm vĩnh cửu mạnh nhất (Nd-Fe-B), dùng trong loa, tai nghe, ổ cứng, mô-tơ xe điện.'},
{z:61,sym:'Pm',vi:'Prometi',en:'Promethium',mass:145,cat:'lanthanide',period:6,group:3,config:'[Xe] 4f5 6s2',density:7.26,melt:1042,boil:3000,summary:'Đất hiếm phóng xạ duy nhất, không có đồng vị bền. Từng dùng trong sơn dạ quang và pin hạt nhân nhỏ.'},
{z:62,sym:'Sm',vi:'Samari',en:'Samarium',mass:150.36,cat:'lanthanide',period:6,group:3,config:'[Xe] 4f6 6s2',density:7.52,melt:1074,boil:1794,summary:'Dùng trong nam châm Sm-Co chịu nhiệt cao, ứng dụng quân sự và hàng không.'},
{z:63,sym:'Eu',vi:'Europi',en:'Europium',mass:151.964,cat:'lanthanide',period:6,group:3,config:'[Xe] 4f7 6s2',density:5.24,melt:822,boil:1529,summary:'Phát quang đỏ và xanh dương mạnh. Dùng trong phốt pho màn hình, đèn LED, mực chống giả tiền euro.'},
{z:64,sym:'Gd',vi:'Gadolini',en:'Gadolinium',mass:157.25,cat:'lanthanide',period:6,group:3,config:'[Xe] 4f7 5d1 6s2',density:7.90,melt:1313,boil:3273,summary:'Có từ tính đặc biệt, dùng làm chất tương phản trong chụp cộng hưởng từ (MRI).'},
{z:65,sym:'Tb',vi:'Terbi',en:'Terbium',mass:158.925,cat:'lanthanide',period:6,group:3,config:'[Xe] 4f9 6s2',density:8.23,melt:1356,boil:3230,summary:'Phát quang xanh lục, dùng trong đèn huỳnh quang, màn hình và vật liệu từ giảo.'},
{z:66,sym:'Dy',vi:'Dysprosi',en:'Dysprosium',mass:162.5,cat:'lanthanide',period:6,group:3,config:'[Xe] 4f10 6s2',density:8.54,melt:1412,boil:2567,summary:'Chịu từ tính cao ở nhiệt độ cao, thêm vào nam châm Nd-Fe-B dùng trong động cơ xe điện.'},
{z:67,sym:'Ho',vi:'Honmi',en:'Holmium',mass:164.930,cat:'lanthanide',period:6,group:3,config:'[Xe] 4f11 6s2',density:8.79,melt:1474,boil:2700,summary:'Có tính từ mạnh nhất trong các nguyên tố. Dùng trong nam châm cực mạnh, laser y tế và nha khoa.'},
{z:68,sym:'Er',vi:'Erbi',en:'Erbium',mass:167.259,cat:'lanthanide',period:6,group:3,config:'[Xe] 4f12 6s2',density:9.07,melt:1529,boil:2868,summary:'Dùng khuếch đại tín hiệu trong sợi quang viễn thông (EDFA) và tạo màu hồng cho thuỷ tinh, gốm sứ.'},
{z:69,sym:'Tm',vi:'Tuli',en:'Thulium',mass:168.934,cat:'lanthanide',period:6,group:3,config:'[Xe] 4f13 6s2',density:9.32,melt:1545,boil:1950,summary:'Đất hiếm hiếm và đắt nhất (trừ nguyên tố phóng xạ). Dùng trong laser y tế và máy đo bức xạ cầm tay.'},
{z:70,sym:'Yb',vi:'Ytecbi',en:'Ytterbium',mass:173.045,cat:'lanthanide',period:6,group:3,config:'[Xe] 4f14 6s2',density:6.90,melt:824,boil:1196,summary:'Dùng trong đồng hồ nguyên tử quang học chính xác cao và sợi cáp quang khuếch đại.'},
{z:71,sym:'Lu',vi:'Luteti',en:'Lutetium',mass:174.967,cat:'lanthanide',period:6,group:3,config:'[Xe] 4f14 5d1 6s2',density:9.84,melt:1663,boil:3402,summary:'Đất hiếm nặng nhất, hiếm và đắt. Dùng trong máy chụp PET (tinh thể LSO) và xúc tác lọc dầu.'},
{z:72,sym:'Hf',vi:'Hafini',en:'Hafnium',mass:178.49,cat:'transition',period:6,group:4,config:'[Xe] 4f14 5d2 6s2',density:13.31,melt:2233,boil:4603,summary:'Chịu nhiệt cực cao, hấp thụ nơtron tốt. Dùng làm thanh điều khiển lò phản ứng hạt nhân, hợp kim siêu bền nhiệt.'},
{z:73,sym:'Ta',vi:'Tantan',en:'Tantalum',mass:180.948,cat:'transition',period:6,group:5,config:'[Xe] 4f14 5d3 6s2',density:16.65,melt:3017,boil:5458,summary:'Chống ăn mòn cực tốt, tương thích sinh học. Dùng làm tụ điện trong điện thoại, cấy ghép y tế.'},
{z:74,sym:'W',vi:'Vonfram',en:'Tungsten',mass:183.84,cat:'transition',period:6,group:6,config:'[Xe] 4f14 5d4 6s2',density:19.25,melt:3422,boil:5555,summary:'Kim loại có nhiệt độ nóng chảy cao nhất. Dùng làm dây tóc bóng đèn, đầu mũi khoan, hợp kim cứng.'},
{z:75,sym:'Re',vi:'Reni',en:'Rhenium',mass:186.207,cat:'transition',period:6,group:7,config:'[Xe] 4f14 5d5 6s2',density:21.02,melt:3186,boil:5596,summary:'Cực hiếm, chịu nhiệt cao. Dùng trong hợp kim siêu bền cho cánh động cơ phản lực turbine.'},
{z:76,sym:'Os',vi:'Osimi',en:'Osmium',mass:190.23,cat:'transition',period:6,group:8,config:'[Xe] 4f14 5d6 6s2',density:22.59,melt:3033,boil:5012,summary:'Kim loại đặc nhất tồn tại tự nhiên. Dùng làm ngòi bút máy, tiếp điểm điện cần độ bền cao.'},
{z:77,sym:'Ir',vi:'Iridi',en:'Iridium',mass:192.217,cat:'transition',period:6,group:9,config:'[Xe] 4f14 5d7 6s2',density:22.56,melt:2446,boil:4428,summary:'Chống ăn mòn tốt nhất trong các kim loại. Từng dùng làm mẫu chuẩn kilôgam quốc tế (hợp kim Pt-Ir).'},
{z:78,sym:'Pt',vi:'Bạch kim',en:'Platinum',mass:195.085,cat:'transition',period:6,group:10,config:'[Xe] 4f14 5d9 6s1',density:21.45,melt:1768.3,boil:3825,summary:'Kim loại quý, trơ hoá học. Dùng làm trang sức, bộ chuyển đổi xúc tác ô tô, điện cực trong công nghiệp.'},
{z:79,sym:'Au',vi:'Vàng',en:'Gold',mass:196.967,cat:'transition',period:6,group:11,config:'[Xe] 4f14 5d10 6s1',density:19.32,melt:1064.2,boil:2856,summary:'Kim loại quý dẻo, dẫn điện tốt, không gỉ. Dùng làm trang sức, dự trữ tài chính, mạ tiếp điểm điện tử.'},
{z:80,sym:'Hg',vi:'Thuỷ ngân',en:'Mercury',mass:200.592,cat:'transition',period:6,group:12,config:'[Xe] 4f14 5d10 6s2',density:13.53,melt:-38.8,boil:356.7,summary:'Kim loại duy nhất ở thể lỏng tại nhiệt độ phòng, độc. Trước đây dùng trong nhiệt kế, nay hạn chế do độc tính.'},
{z:81,sym:'Tl',vi:'Tali',en:'Thallium',mass:204.38,cat:'post',period:6,group:13,config:'[Xe] 4f14 5d10 6s2 6p1',density:11.85,melt:304,boil:1473,summary:'Kim loại độc mạnh. Dùng trong một số linh kiện điện tử quang học và đồng vị phóng xạ chẩn đoán tim.'},
{z:82,sym:'Pb',vi:'Chì',en:'Lead',mass:207.2,cat:'post',period:6,group:14,config:'[Xe] 4f14 5d10 6s2 6p2',density:11.34,melt:327.5,boil:1749,summary:'Kim loại mềm, độc, chắn phóng xạ tốt. Dùng trong ắc quy chì-axit, tấm chắn tia X, hàn (đang bị hạn chế).'},
{z:83,sym:'Bi',vi:'Bitmut',en:'Bismuth',mass:208.98,cat:'post',period:6,group:15,config:'[Xe] 4f14 5d10 6s2 6p3',density:9.78,melt:271.4,boil:1564,summary:'Kim loại nặng ít độc nhất, tạo tinh thể cầu vồng đẹp mắt. Dùng trong mỹ phẩm, thuốc dạ dày (Pepto-Bismol), hợp kim dễ chảy.'},
{z:84,sym:'Po',vi:'Poloni',en:'Polonium',mass:209,cat:'metalloid',period:6,group:16,config:'[Xe] 4f14 5d10 6s2 6p4',density:9.20,melt:254,boil:962,summary:'Nguyên tố phóng xạ mạnh do Marie Curie phát hiện. Dùng trong nguồn nhiệt điện đồng vị cho tàu vũ trụ (lịch sử).'},
{z:85,sym:'At',vi:'Atatin',en:'Astatine',mass:210,cat:'halogen',period:6,group:17,config:'[Xe] 4f14 5d10 6s2 6p5',density:null,melt:302,boil:337,summary:'Halogen phóng xạ hiếm nhất trong tự nhiên, chỉ tồn tại lượng cực nhỏ. Đang nghiên cứu dùng trong xạ trị ung thư.'},
{z:86,sym:'Rn',vi:'Radon',en:'Radon',mass:222,cat:'noble',period:6,group:18,config:'[Xe] 4f14 5d10 6s2 6p6',density:9.73,densityUnit:'g/L (khí)',melt:-71,boil:-61.7,summary:'Khí hiếm phóng xạ, sinh ra từ phân rã urani trong đất đá. Có thể tích tụ trong tầng hầm nhà, gây nguy cơ ung thư phổi.'},
{z:87,sym:'Fr',vi:'Franxi',en:'Francium',mass:223,cat:'alkali',period:7,group:1,config:'[Rn] 7s1',density:null,melt:27,boil:677,summary:'Kim loại kiềm phóng xạ hiếm nhất trong tự nhiên, chỉ tồn tại vài chục gam trên toàn Trái Đất tại một thời điểm.'},
{z:88,sym:'Ra',vi:'Radi',en:'Radium',mass:226,cat:'alkaline',period:7,group:2,config:'[Rn] 7s2',density:5.5,melt:700,boil:1737,summary:'Nguyên tố phóng xạ do Marie và Pierre Curie phát hiện. Trước đây dùng trong sơn dạ quang, nay dùng trong xạ trị.'},
{z:89,sym:'Ac',vi:'Actini',en:'Actinium',mass:227,cat:'actinide',period:7,group:3,config:'[Rn] 6d1 7s2',density:10.07,melt:1050,boil:3200,summary:'Nguyên tố mở đầu dãy actini, phóng xạ mạnh, phát sáng xanh trong bóng tối. Dùng trong nguồn nơtron nghiên cứu.'},
{z:90,sym:'Th',vi:'Thori',en:'Thorium',mass:232.038,cat:'actinide',period:7,group:3,config:'[Rn] 6d2 7s2',density:11.72,melt:1750,boil:4788,summary:'Nguyên liệu tiềm năng cho lò phản ứng hạt nhân thế hệ mới (chu trình thori), trữ lượng dồi dào hơn urani.'},
{z:91,sym:'Pa',vi:'Protactini',en:'Protactinium',mass:231.036,cat:'actinide',period:7,group:3,config:'[Rn] 5f2 6d1 7s2',density:15.37,melt:1568,boil:4027,summary:'Nguyên tố actini hiếm, phóng xạ mạnh, chủ yếu dùng trong nghiên cứu khoa học cơ bản.'},
{z:92,sym:'U',vi:'Urani',en:'Uranium',mass:238.029,cat:'actinide',period:7,group:3,config:'[Rn] 5f3 6d1 7s2',density:19.05,melt:1132,boil:4131,summary:'Nhiên liệu chính cho nhà máy điện hạt nhân và vũ khí hạt nhân (đồng vị U-235 phân hạch được).'},
{z:93,sym:'Np',vi:'Neptuni',en:'Neptunium',mass:237,cat:'actinide',period:7,group:3,config:'[Rn] 5f4 6d1 7s2',density:20.45,melt:644,boil:3902,summary:'Nguyên tố siêu urani đầu tiên được tổng hợp (1940). Sản phẩm phụ của lò phản ứng hạt nhân.'},
{z:94,sym:'Pu',vi:'Plutoni',en:'Plutonium',mass:244,cat:'actinide',period:7,group:3,config:'[Rn] 5f6 7s2',density:19.82,melt:639.6,boil:3228,summary:'Dùng làm nhiên liệu vũ khí hạt nhân và nguồn năng lượng cho tàu thăm dò không gian (pin nhiệt điện đồng vị).'},
{z:95,sym:'Am',vi:'Americi',en:'Americium',mass:243,cat:'actinide',period:7,group:3,config:'[Rn] 5f7 7s2',density:13.69,melt:1176,boil:2607,summary:'Dùng trong đầu dò khói ion hoá gia dụng (nguồn phóng xạ Am-241 liều cực nhỏ).'},
{z:96,sym:'Cm',vi:'Curi',en:'Curium',mass:247,cat:'actinide',period:7,group:3,config:'[Rn] 5f7 6d1 7s2',density:13.51,melt:1345,boil:3110,summary:'Đặt theo tên Marie và Pierre Curie. Nguyên tố phóng xạ tổng hợp, dùng trong nguồn nhiệt điện cho thiết bị thăm dò sao Hoả.'},
{z:97,sym:'Bk',vi:'Berkeli',en:'Berkelium',mass:247,cat:'actinide',period:7,group:3,config:'[Rn] 5f9 7s2',density:14.79,melt:986,boil:2900,summary:'Nguyên tố tổng hợp, phóng xạ, chỉ được tạo ra với lượng cực nhỏ trong máy gia tốc hạt để nghiên cứu.'},
{z:98,sym:'Cf',vi:'Californi',en:'Californium',mass:251,cat:'actinide',period:7,group:3,config:'[Rn] 5f10 7s2',density:15.1,melt:900,boil:1470,summary:'Nguồn nơtron mạnh, dùng khởi động lò phản ứng hạt nhân và trong thăm dò dầu khí, kiểm tra hành lý sân bay.'},
{z:99,sym:'Es',vi:'Einsteini',en:'Einsteinium',mass:252,cat:'actinide',period:7,group:3,config:'[Rn] 5f11 7s2',density:8.84,melt:860,boil:null,summary:'Được phát hiện trong tro bụi vụ thử bom nhiệt hạch đầu tiên (1952). Chỉ tồn tại trong phòng thí nghiệm, dùng nghiên cứu cơ bản.'},
{z:100,sym:'Fm',vi:'Fermi',en:'Fermium',mass:257,cat:'actinide',period:7,group:3,config:'[Rn] 5f12 7s2',density:null,melt:1527,boil:null,summary:'Nguyên tố tổng hợp phóng xạ, không có ứng dụng thực tế, chỉ dùng nghiên cứu cấu trúc hạt nhân.'},
{z:101,sym:'Md',vi:'Mendelevi',en:'Mendelevium',mass:258,cat:'actinide',period:7,group:3,config:'[Rn] 5f13 7s2',density:null,melt:827,boil:null,summary:'Đặt theo tên Dmitri Mendeleev, cha đẻ bảng tuần hoàn. Tổng hợp từng nguyên tử một trong máy gia tốc hạt.'},
{z:102,sym:'No',vi:'Nobeli',en:'Nobelium',mass:259,cat:'actinide',period:7,group:3,config:'[Rn] 5f14 7s2',density:null,melt:827,boil:null,summary:'Đặt theo tên Alfred Nobel. Nguyên tố tổng hợp phóng xạ, chu kỳ bán rã rất ngắn, chỉ phục vụ nghiên cứu.'},
{z:103,sym:'Lr',vi:'Lawrenci',en:'Lawrencium',mass:266,cat:'actinide',period:7,group:3,config:'[Rn] 5f14 7s2 7p1',density:null,melt:1627,boil:null,summary:'Nguyên tố cuối dãy actini, tổng hợp nhân tạo, tồn tại rất ngắn ngủi, chỉ phục vụ nghiên cứu hạt nhân.'},
{z:104,sym:'Rf',vi:'Rutherfordi',en:'Rutherfordium',mass:267,cat:'transition',period:7,group:4,config:'[Rn] 5f14 6d2 7s2',density:null,melt:null,boil:null,summary:'Nguyên tố siêu nặng tổng hợp, đặt theo tên nhà vật lý Ernest Rutherford. Chưa có ứng dụng thực tế ngoài nghiên cứu.'},
{z:105,sym:'Db',vi:'Dubni',en:'Dubnium',mass:268,cat:'transition',period:7,group:5,config:'[Rn] 5f14 6d3 7s2',density:null,melt:null,boil:null,summary:'Nguyên tố siêu nặng tổng hợp, đặt theo tên thành phố Dubna (Nga), nơi được tổng hợp lần đầu.'},
{z:106,sym:'Sg',vi:'Seaborgi',en:'Seaborgium',mass:269,cat:'transition',period:7,group:6,config:'[Rn] 5f14 6d4 7s2',density:null,melt:null,boil:null,summary:'Đặt theo tên nhà hoá học Glenn Seaborg. Nguyên tố siêu nặng tổng hợp, chỉ tồn tại vài giây.'},
{z:107,sym:'Bh',vi:'Bohri',en:'Bohrium',mass:270,cat:'transition',period:7,group:7,config:'[Rn] 5f14 6d5 7s2',density:null,melt:null,boil:null,summary:'Đặt theo tên nhà vật lý Niels Bohr. Nguyên tố siêu nặng tổng hợp, chu kỳ bán rã cực ngắn.'},
{z:108,sym:'Hs',vi:'Hassi',en:'Hassium',mass:269,cat:'transition',period:7,group:8,config:'[Rn] 5f14 6d6 7s2',density:null,melt:null,boil:null,summary:'Đặt theo tên bang Hessen (Đức), nơi đặt phòng thí nghiệm GSI tổng hợp ra nguyên tố này.'},
{z:109,sym:'Mt',vi:'Meitneri',en:'Meitnerium',mass:278,cat:'transition',period:7,group:9,config:'[Rn] 5f14 6d7 7s2',density:null,melt:null,boil:null,summary:'Đặt theo tên nhà vật lý Lise Meitner. Nguyên tố siêu nặng tổng hợp, chỉ tạo được vài nguyên tử.'},
{z:110,sym:'Ds',vi:'Darmstadti',en:'Darmstadtium',mass:281,cat:'transition',period:7,group:10,config:'[Rn] 5f14 6d8 7s2',density:null,melt:null,boil:null,summary:'Đặt theo tên thành phố Darmstadt (Đức), nơi phòng thí nghiệm GSI tổng hợp ra nguyên tố này năm 1994.'},
{z:111,sym:'Rg',vi:'Roentgeni',en:'Roentgenium',mass:282,cat:'transition',period:7,group:11,config:'[Rn] 5f14 6d9 7s2',density:null,melt:null,boil:null,summary:'Đặt theo tên Wilhelm Röntgen, người phát hiện tia X. Nguyên tố siêu nặng tổng hợp.'},
{z:112,sym:'Cn',vi:'Copernixi',en:'Copernicium',mass:285,cat:'transition',period:7,group:12,config:'[Rn] 5f14 6d10 7s2',density:null,melt:null,boil:null,summary:'Đặt theo tên nhà thiên văn Nicolaus Copernicus. Có thể có tính chất giống khí hiếm ở thể hơi.'},
{z:113,sym:'Nh',vi:'Nihoni',en:'Nihonium',mass:286,cat:'post',period:7,group:13,config:'[Rn] 5f14 6d10 7s2 7p1',density:null,melt:null,boil:null,summary:'Nguyên tố đầu tiên được đặt tên bởi nhóm nghiên cứu châu Á (Nhật Bản, RIKEN), "Nihon" nghĩa là Nhật Bản.'},
{z:114,sym:'Fl',vi:'Flerovi',en:'Flerovium',mass:289,cat:'post',period:7,group:14,config:'[Rn] 5f14 6d10 7s2 7p2',density:null,melt:null,boil:null,summary:'Đặt theo tên phòng thí nghiệm Flerov (Nga). Nằm gần "đảo bền" lý thuyết của các nguyên tố siêu nặng.'},
{z:115,sym:'Mc',vi:'Moscovi',en:'Moscovium',mass:290,cat:'post',period:7,group:15,config:'[Rn] 5f14 6d10 7s2 7p3',density:null,melt:null,boil:null,summary:'Đặt theo tên vùng Moskva (Nga), nơi hợp tác tổng hợp ra nguyên tố này.'},
{z:116,sym:'Lv',vi:'Livermori',en:'Livermorium',mass:293,cat:'post',period:7,group:16,config:'[Rn] 5f14 6d10 7s2 7p4',density:null,melt:null,boil:null,summary:'Đặt theo tên Phòng thí nghiệm Quốc gia Lawrence Livermore (Mỹ), đơn vị đồng tổng hợp nguyên tố này.'},
{z:117,sym:'Ts',vi:'Tennessin',en:'Tennessine',mass:294,cat:'halogen',period:7,group:17,config:'[Rn] 5f14 6d10 7s2 7p5',density:null,melt:null,boil:null,summary:'Đặt theo tên bang Tennessee (Mỹ). Là halogen nặng nhất được tổng hợp, chỉ tồn tại phần nghìn giây.'},
{z:118,sym:'Og',vi:'Oganesson',en:'Oganesson',mass:294,cat:'noble',period:7,group:18,config:'[Rn] 5f14 6d10 7s2 7p6',density:null,melt:null,boil:null,summary:'Nguyên tố nặng nhất được tổng hợp tính đến nay, đặt theo tên nhà vật lý Yuri Oganessian còn sống lúc đặt tên.'}
];

const CATEGORY_LABELS = {
  alkali: 'Kim loại kiềm',
  alkaline: 'Kim loại kiềm thổ',
  lanthanide: 'Nhóm Lantan',
  actinide: 'Nhóm Actini',
  transition: 'Kim loại chuyển tiếp',
  post: 'Kim loại yếu',
  metalloid: 'Á kim / Bán kim',
  nonmetal: 'Phi kim',
  halogen: 'Halogen',
  noble: 'Khí hiếm'
};

const CATEGORY_COLORS = {
  alkali: '#f87171',
  alkaline: '#fb923c',
  lanthanide: '#c084fc',
  actinide: '#e879f9',
  transition: '#60a5fa',
  post: '#38bdf8',
  metalloid: '#2dd4bf',
  nonmetal: '#34d399',
  halogen: '#facc15',
  noble: '#a78bfa'
};

function getElementByZ(z) {
  return ELEMENTS.find((e) => e.z === z);
}

// Vị trí hiển thị trên lưới 18 cột (dãy Lantan/Actini tách xuống 2 hàng riêng, hàng 8 để trống làm khoảng cách).
function gridPositionForZ(z) {
  if (z >= 1 && z <= 2) return { row: 1, col: z === 1 ? 1 : 18 };
  if (z >= 3 && z <= 10) return { row: 2, col: z <= 4 ? z - 2 : z - 2 + 10 };
  if (z >= 11 && z <= 18) return { row: 3, col: z <= 12 ? z - 10 : z - 10 + 10 };
  if (z >= 19 && z <= 36) return { row: 4, col: z - 18 };
  if (z >= 37 && z <= 54) return { row: 5, col: z - 36 };
  if (z === 55 || z === 56) return { row: 6, col: z - 54 };
  if (z >= 57 && z <= 71) return { row: 9, col: z - 54 }; // La..Lu, cột 3-17
  if (z >= 72 && z <= 86) return { row: 6, col: z - 68 };
  if (z === 87 || z === 88) return { row: 7, col: z - 86 };
  if (z >= 89 && z <= 103) return { row: 10, col: z - 86 }; // Ac..Lr, cột 3-17
  if (z >= 104 && z <= 118) return { row: 7, col: z - 100 };
  return { row: 0, col: 0 };
}
