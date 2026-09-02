// Trang "Hồ sơ giáo viên": cho phép giáo viên tự đặt tên hiển thị, đơn vị công tác, giới thiệu
// ngắn và ảnh đại diện riêng (khác ảnh tài khoản Google) để cá nhân hoá app.
// Ảnh được resize/nén ngay trên trình duyệt (canvas) rồi lưu thẳng vào Firestore dạng data URL —
// không dùng Cloud Storage vì Firebase hiện yêu cầu gói trả phí (Blaze) cho Storage, còn Firestore
// (đang dùng) vẫn miễn phí trong hạn mức.

const PROFILE_PHOTO_SIZE = 240; // px, ảnh vuông sau khi resize
const PROFILE_PHOTO_MAX_BYTES = 350 * 1024; // ~350KB data URL, an toàn dưới giới hạn 1MB/doc của Firestore

function resizeImageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được file ảnh.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('File không phải ảnh hợp lệ.'));
      img.onload = () => {
        const size = PROFILE_PHOTO_SIZE;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        // Cắt vuông giữa ảnh (kiểu "cover") rồi vẽ vừa khung size x size.
        const srcSize = Math.min(img.width, img.height);
        const sx = (img.width - srcSize) / 2;
        const sy = (img.height - srcSize) / 2;
        ctx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, size, size);
        let quality = 0.85;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > PROFILE_PHOTO_MAX_BYTES && quality > 0.3) {
          quality -= 0.15;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        if (dataUrl.length > PROFILE_PHOTO_MAX_BYTES) {
          reject(new Error('Ảnh vẫn quá lớn sau khi nén, chọn ảnh khác nhé.'));
          return;
        }
        resolve(dataUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

(function () {
  let newPhotoDataUrl = null; // ảnh mới chọn, chưa lưu
  let resetPhoto = false; // true nếu bấm "Dùng lại ảnh Google"

  function updatePhotoPreview(url) {
    const el = $('#profilePhotoPreview');
    el.innerHTML = url
      ? `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" referrerpolicy="no-referrer" />`
      : `<span style="font-size:32px;">👤</span>`;
  }

  requireTeacherAuth(async (user) => {
    const box = $('#profileResult');
    let profile = null;
    try { profile = await fetchTeacherProfile(user.uid); } catch (e) { /* dùng mặc định từ Google */ }

    $('#profileName').value = (profile && profile.displayName) || user.displayName || '';
    $('#profileGender').value = (profile && profile.gender) || '';
    $('#profileWorkplace').value = (profile && profile.workplace) || '';
    $('#profileBio').value = (profile && profile.bio) || '';
    $('#profilePhone').value = (profile && profile.phone) || '';
    $('#profileZalo').value = (profile && profile.zaloLink) || '';
    $('#profileFacebook').value = (profile && profile.facebookLink) || '';
    updatePhotoPreview((profile && profile.photoURL) || user.photoURL || '');

    // Hồ sơ tạo trước khi có tính năng "mã giáo viên" sẽ chưa có teacherCode lưu sẵn — mã này tính
    // thẳng từ uid nên hiện được ngay lập tức, không cần chờ Firestore; chỉ cần lưu lại (nền, không
    // chặn hiển thị) để lần đăng ký của học sinh tra cứu được bằng mã.
    let teacherCode = profile && profile.teacherCode;
    if (!teacherCode) {
      teacherCode = deriveTeacherCode(user.uid);
      try {
        const { db } = ensureFirebase();
        await Promise.all([
          db.collection('teachers').doc(user.uid).set({ teacherCode }, { merge: true }),
          db.collection('teacherProfiles').doc(user.uid).set({ teacherCode }, { merge: true })
        ]);
      } catch (e) { /* mã vẫn hiện đúng (tính được ngay) — sẽ lưu lại ở lần ghé trang sau */ }
    }
    $('#profileTeacherCode').textContent = teacherCode;

    const shareBox = $('#shareResult');
    $('#shareToStudentBtn').addEventListener('click', () => {
      const name = $('#profileName').value.trim() || user.displayName || 'thầy/cô';
      const url = buildShareUrl({ tc: teacherCode });
      shareOrCopyLink(
        `Học cùng ${name}`,
        `Bấm vào để đăng ký học cùng ${name} trên Trợ Lý Giáo Viên Hoá Học nhé!`,
        url, shareBox
      );
    });
    $('#shareToTeacherBtn').addEventListener('click', () => {
      const url = buildShareUrl({ ref: teacherCode });
      shareOrCopyLink(
        'Trợ Lý Giáo Viên Hoá Học',
        'Mời bạn dùng thử app Trợ Lý Giáo Viên Hoá Học — soạn bài giảng, quản lý nhóm học sinh, tạo đề kiểm tra tự động!',
        url, shareBox
      );
    });

    $('#profilePhotoBtn').addEventListener('click', () => $('#profilePhotoInput').click());

    $('#profilePhotoInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        showResult(box, '⏳ Đang xử lý ảnh...');
        newPhotoDataUrl = await resizeImageToDataUrl(file);
        resetPhoto = false;
        updatePhotoPreview(newPhotoDataUrl);
        hideResult(box);
      } catch (err) {
        showResult(box, `⚠️ ${escapeHtml(err.message)}`, true);
      }
    });

    $('#profilePhotoResetBtn').addEventListener('click', () => {
      newPhotoDataUrl = null;
      resetPhoto = true;
      updatePhotoPreview(user.photoURL || '');
    });

    $('#profileSaveBtn').addEventListener('click', async () => {
      const name = $('#profileName').value.trim();
      const gender = $('#profileGender').value;
      if (!name) { showResult(box, '⚠️ Nhập tên hiển thị.', true); return; }
      if (!gender) { showResult(box, '⚠️ Chọn giới tính (Thầy/Cô) trước khi lưu.', true); return; }
      showResult(box, '⏳ Đang lưu...');
      try {
        const { db } = ensureFirebase();
        const data = {
          displayName: name,
          gender,
          workplace: $('#profileWorkplace').value.trim(),
          bio: $('#profileBio').value.trim(),
          phone: $('#profilePhone').value.trim(),
          zaloLink: $('#profileZalo').value.trim(),
          facebookLink: $('#profileFacebook').value.trim(),
          updatedAt: new Date().toISOString()
        };
        // Bản công khai (không có email) — dùng để cá nhân hoá trang chủ cho học sinh trong nhóm
        // của giáo viên này xem, và hiện nút liên hệ (xem js/features/branding.js). Số điện thoại/
        // Zalo/Facebook/giới tính cố ý công khai vì mục đích là để học sinh liên hệ/xưng hô đúng.
        const publicData = {
          displayName: data.displayName, gender: data.gender, bio: data.bio,
          phone: data.phone, zaloLink: data.zaloLink, facebookLink: data.facebookLink,
          updatedAt: data.updatedAt
        };
        if (resetPhoto) {
          // "Dùng lại ảnh Google" phải THỰC SỰ lưu lại link ảnh Google vào hồ sơ công khai — nếu chỉ
          // xoá photoURL thì học sinh/trang chủ (không đăng nhập được tài khoản Google của giáo viên)
          // sẽ không có ảnh nào để hiện cả, dù ô xem trước ở trang này vẫn thấy ảnh Google bình thường.
          if (user.photoURL) {
            data.photoURL = user.photoURL;
            publicData.photoURL = user.photoURL;
          } else {
            data.photoURL = firebase.firestore.FieldValue.delete();
            publicData.photoURL = firebase.firestore.FieldValue.delete();
          }
        } else if (newPhotoDataUrl) {
          data.photoURL = newPhotoDataUrl;
          publicData.photoURL = newPhotoDataUrl;
        }
        await Promise.all([
          db.collection('teachers').doc(user.uid).set(data, { merge: true }),
          db.collection('teacherProfiles').doc(user.uid).set(publicData, { merge: true })
        ]);
        newPhotoDataUrl = null;
        resetPhoto = false;
        showResult(box, '✅ Đã lưu hồ sơ.');
        setTimeout(() => { window.location.href = '../index.html'; }, 1200);
      } catch (err) {
        showResult(box, `⚠️ ${escapeHtml(err.message)}`, true);
      }
    });
  });
})();
