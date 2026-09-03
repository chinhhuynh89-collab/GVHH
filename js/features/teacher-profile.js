// Trang "Hồ sơ giáo viên": cho phép giáo viên tự đặt tên hiển thị, đơn vị công tác, giới thiệu
// ngắn và ảnh đại diện riêng (khác ảnh tài khoản Google) để cá nhân hoá app.
// Ảnh được resize/nén ngay trên trình duyệt (canvas) rồi lưu thẳng vào Firestore dạng data URL —
// không dùng Cloud Storage vì Firebase hiện yêu cầu gói trả phí (Blaze) cho Storage, còn Firestore
// (đang dùng) vẫn miễn phí trong hạn mức.
//
// Bố cục: 1 lưới nút (giống trang Quản trị) — bấm nút nào thì chỉ mở đúng khung nội dung của mục đó.

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
  requireTeacherAuth(async (user) => {
    let profile = null;
    try { profile = await fetchTeacherProfile(user.uid); } catch (e) { /* dùng mặc định từ Google */ }

    // Hồ sơ tạo trước khi có tính năng "mã giáo viên" sẽ chưa có teacherCode lưu sẵn — mã này tính
    // thẳng từ uid nên có ngay lập tức, không cần chờ Firestore; chỉ cần lưu lại (nền) để lần đăng
    // ký của học sinh tra cứu được bằng mã.
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

    let newPhotoDataUrl = null; // ảnh mới chọn, chưa lưu
    let resetPhoto = false; // true nếu bấm "Dùng lại ảnh Google"
    let openSection = null;

    // ---------- Điều hướng: 1 khung nội dung duy nhất, đổi theo nút vừa bấm ----------
    const SECTION_BUILDERS = { code: buildCodeSection, info: buildInfoSection, plan: buildPlanSection };

    $$('.profile-menu-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.section;
        const panel = $('#profileSectionPanel');
        if (openSection === key) {
          panel.style.display = 'none';
          panel.innerHTML = '';
          btn.classList.remove('has-open');
          openSection = null;
          return;
        }
        $$('.profile-menu-btn').forEach((b) => b.classList.remove('has-open'));
        btn.classList.add('has-open');
        openSection = key;
        panel.style.display = 'block';
        panel.innerHTML = '<div class="card"><p class="hint">⏳ Đang tải...</p></div>';
        try {
          await SECTION_BUILDERS[key](panel);
        } catch (e) {
          panel.innerHTML = `<div class="card"><p class="hint">⚠️ ${escapeHtml(e.message)}</p></div>`;
        }
      });
    });

    // ---------- 🔑 Mã & chia sẻ ----------
    function buildCodeSection(panel) {
      panel.innerHTML = `
        <div class="card">
          <h2><span class="icon">🔑</span>Mã giáo viên của bạn</h2>
          <p class="hint" style="margin-top:-4px;">Gửi mã này cho học sinh — các em bấm "Đăng ký học cùng thầy (cô)" ở trang chủ và nhập đúng mã này để đăng ký. Bạn sẽ nhận thông báo và tự xếp học sinh vào nhóm phù hợp.</p>
          <div style="text-align:center;font-size:28px;font-weight:700;letter-spacing:0.1em;color:var(--brand);padding:10px 0;">${escapeHtml(teacherCode)}</div>
          <div class="btn-row">
            <button class="btn primary" id="shareToStudentBtn" type="button" style="flex:1;">📤 Chia sẻ cho học sinh</button>
            <button class="btn" id="shareToTeacherBtn" type="button" style="flex:1;">📤 Chia sẻ cho giáo viên khác</button>
          </div>
          <div class="hint" style="margin-top:8px;">"Chia sẻ cho học sinh" gửi kèm mã của bạn — học sinh mở link sẽ thấy ngay trang của bạn và không cần nhập mã khi đăng ký. "Chia sẻ cho giáo viên khác" mời đồng nghiệp dùng thử app, kèm mã giới thiệu của bạn.</div>
          <div class="result-box" id="shareResult"></div>
        </div>
      `;
      const shareBox = $('#shareResult');
      $('#shareToStudentBtn').addEventListener('click', () => {
        const name = (profile && profile.displayName) || user.displayName || 'thầy/cô';
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
    }

    // ---------- 🙍 Thông tin cá nhân ----------
    function updatePhotoPreview(url) {
      const el = $('#profilePhotoPreview');
      if (!el) return;
      el.innerHTML = url
        ? `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" referrerpolicy="no-referrer" />`
        : `<span style="font-size:32px;">👤</span>`;
    }

    function buildInfoSection(panel) {
      panel.innerHTML = `
        <div class="card">
          <h2><span class="icon">🙍</span>Thông tin cá nhân</h2>
          <p class="hint" style="margin-top:-4px;">Tên, ảnh và khẩu hiệu này hiện ở các trang giáo viên trong app, VÀ ở trang chủ cho học sinh trong nhóm của bạn xem ("Học cùng {tên bạn}") — dùng để xây dựng thương hiệu riêng.</p>

          <div style="display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:16px;">
            <div id="profilePhotoPreview" style="width:88px;height:88px;border-radius:50%;background:var(--surface-2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;overflow:hidden;"></div>
            <div class="btn-row">
              <button class="btn" id="profilePhotoBtn" type="button">🖼️ Đổi ảnh</button>
              <button class="btn" id="profilePhotoResetBtn" type="button">Dùng lại ảnh Google</button>
            </div>
            <input type="file" id="profilePhotoInput" accept="image/*" style="display:none;" />
          </div>

          <div class="field">
            <label for="profileName">Tên hiển thị</label>
            <input type="text" id="profileName" placeholder="VD: Thầy Chính" />
          </div>
          <div class="field">
            <label for="profileGender">Giới tính *</label>
            <select id="profileGender">
              <option value="">-- Chọn để xưng hô đúng Thầy/Cô --</option>
              <option value="male">Nam (Thầy)</option>
              <option value="female">Nữ (Cô)</option>
            </select>
            <div class="hint" style="margin-top:4px;">Dùng để các nút mời học sinh (Liên hệ, Đăng ký...) tự xưng hô đúng "Thầy" hoặc "Cô".</div>
          </div>
          <div class="field">
            <label for="profileWorkplace">Đơn vị công tác</label>
            <input type="text" id="profileWorkplace" placeholder="VD: Trường Quân sự Quân đoàn 34" />
          </div>
          <div class="field">
            <label for="profileBio">Khẩu hiệu / giới thiệu ngắn</label>
            <textarea id="profileBio" rows="2" placeholder="VD: Học Hoá dễ hiểu, thi đâu trúng đó!" maxlength="120"></textarea>
            <div class="hint" style="margin-top:4px;">Hiện ngay dưới tên bạn trên trang chủ (thay cho dòng mô tả mặc định).</div>
          </div>

          <div class="field">
            <label for="profilePhone">Số điện thoại</label>
            <input type="tel" id="profilePhone" placeholder="VD: 0912345678" />
          </div>
          <div class="field">
            <label for="profileZalo">Link Zalo</label>
            <input type="text" id="profileZalo" placeholder="VD: 0912345678 hoặc https://zalo.me/0912345678" />
          </div>
          <div class="field">
            <label for="profileFacebook">Link Facebook</label>
            <input type="text" id="profileFacebook" placeholder="VD: facebook.com/ten.thay.co" />
          </div>
          <div class="hint" style="margin-top:-6px;margin-bottom:10px;">Học sinh trong nhóm của bạn sẽ thấy nút "Liên hệ với thầy (cô)" ở trang chủ để gọi điện/nhắn tin cho bạn. Để trống mục nào thì học sinh sẽ không thấy nút đó.</div>

          <button class="btn primary block" id="profileSaveBtn">Lưu hồ sơ</button>
          <div class="result-box" id="profileResult"></div>
        </div>
      `;

      $('#profileName').value = (profile && profile.displayName) || user.displayName || '';
      $('#profileGender').value = (profile && profile.gender) || '';
      $('#profileWorkplace').value = (profile && profile.workplace) || '';
      $('#profileBio').value = (profile && profile.bio) || '';
      $('#profilePhone').value = (profile && profile.phone) || '';
      $('#profileZalo').value = (profile && profile.zaloLink) || '';
      $('#profileFacebook').value = (profile && profile.facebookLink) || '';
      updatePhotoPreview((profile && profile.photoURL) || user.photoURL || '');

      const box = $('#profileResult');

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
          profile = Object.assign({}, profile, data);
          newPhotoDataUrl = null;
          resetPhoto = false;
          showResult(box, '✅ Đã lưu hồ sơ.');
          setTimeout(() => { window.location.href = '../index.html'; }, 1200);
        } catch (err) {
          showResult(box, `⚠️ ${escapeHtml(err.message)}`, true);
        }
      });
    }

    // ---------- ⭐ Gói & hoa hồng ----------
    async function buildPlanSection(panel) {
      panel.innerHTML = `
        <div class="card">
          <h2><span class="icon">⭐</span>Gói của bạn</h2>
          <div id="subscriptionBody"><p class="hint">⏳ Đang tải...</p></div>
        </div>
        <div class="card">
          <h2><span class="icon">💰</span>Hoa hồng của tôi</h2>
          <p class="hint" style="margin-top:-4px;">Nhận hoa hồng khi: (1) giáo viên bạn giới thiệu nâng cấp gói Pro, hoặc (2) học sinh trong nhóm của bạn nâng cấp Premium — cấp 1 (F1) là người/nhóm trực tiếp của bạn, cấp 2 (F2) là 1 tầng xa hơn (VD giáo viên bạn giới thiệu lại giới thiệu tiếp người khác). Học sinh không bao giờ nhận hoa hồng, kể cả khi tự chia sẻ link cho bạn bè.</p>
          <div id="commissionsBody"><p class="hint">⏳ Đang tải...</p></div>
        </div>
        <div class="card">
          <h2><span class="icon">🌳</span>Giáo viên bạn đã giới thiệu</h2>
          <div id="referredTeachersBody"><p class="hint">⏳ Đang tải...</p></div>
        </div>
      `;
      await renderSubscriptionAndCommissions(user);
    }
  });
})();

// "Gói của bạn" + "Hoa hồng của tôi" + "Giáo viên bạn đã giới thiệu" — chỉ hiện nội dung thật khi
// admin đã bật công tắc tổng (config/monetization); ngược lại báo rõ để giáo viên không thắc mắc
// sao trống trơn.
async function renderSubscriptionAndCommissions(user) {
  const subBody = $('#subscriptionBody');
  const commBody = $('#commissionsBody');
  const referredBody = $('#referredTeachersBody');
  const cfg = await getMonetizationConfig();
  if (!cfg.enabled) {
    subBody.innerHTML = '<p class="hint">Chưa mở tính năng gói trả phí vào lúc này.</p>';
    commBody.innerHTML = '<p class="hint">Chưa mở tính năng hoa hồng vào lúc này.</p>';
    referredBody.innerHTML = '<p class="hint">Chưa mở tính năng hoa hồng vào lúc này.</p>';
    return;
  }

  const sub = await getTeacherSubscription(user.uid);
  if (sub.tier === 'pro') {
    subBody.innerHTML = `
      <p class="hint">Trạng thái: <strong style="color:var(--brand);">Pro</strong> — hết hạn ${escapeHtml((sub.expiresAt || '').slice(0, 10))}.</p>
      <a class="btn block" href="nang-cap.html">Gia hạn / xem lại thông tin gói</a>
    `;
  } else {
    subBody.innerHTML = `
      <p class="hint">Trạng thái: <strong>Miễn phí</strong> — giới hạn ${cfg.teacherPlan.maxGroupsFree} nhóm, ${cfg.teacherPlan.maxStudentsFree} học sinh.</p>
      <a class="btn primary block" href="nang-cap.html">⭐ Nâng cấp lên Pro</a>
    `;
  }

  try {
    const { db } = ensureFirebase();
    const snap = await db.collection('commissions').where('beneficiaryTeacherUid', '==', user.uid).get();
    const list = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    if (!list.length) {
      commBody.innerHTML = '<p class="hint">Chưa có hoa hồng nào — chia sẻ link giới thiệu để bắt đầu nhé!</p>';
    } else {
      // Bản ghi cũ (trước khi có hold period) có thể chưa có "status" mới — coi như "pending_hold".
      const normStatus = (c) => (c.status === 'pending' || !c.status) ? 'pending_hold' : c.status;
      const groups = [
        { status: 'pending_hold', label: '⏳ Chờ giữ' },
        { status: 'available', label: '✅ Sẵn sàng rút' },
        { status: 'paid', label: '💰 Đã trả' }
      ];
      const totalsByStatus = {};
      groups.forEach((g) => { totalsByStatus[g.status] = list.filter((c) => normStatus(c) === g.status).reduce((s, c) => s + (Number(c.amount) || 0), 0); });
      commBody.innerHTML = `
        <p class="hint">${groups.map((g) => `${g.label}: <strong>${formatVnd(totalsByStatus[g.status])}</strong>`).join(' · ')}</p>
        ${list.map((c) => `
          <div class="hint" style="padding:8px 0;border-top:1px solid var(--border);">
            ${formatVnd(c.amount)} · ${c.tier || '—'} (${c.percent}%) · ${escapeHtml(c.sourceName || '')}${c.sourceOrderCode ? ` · Đơn ${escapeHtml(c.sourceOrderCode)}` : ''} ·
            ${normStatus(c) === 'paid' ? '💰 Đã trả' : normStatus(c) === 'available' ? '✅ Sẵn sàng rút' : '⏳ Chờ giữ'}
          </div>
        `).join('')}
      `;
    }
  } catch (e) {
    commBody.innerHTML = `<p class="hint">⚠️ ${escapeHtml(e.message)}</p>`;
  }

  try {
    const { db } = ensureFirebase();
    const snap = await db.collection('teacherProfiles').where('referredByUid', '==', user.uid).get();
    const list = snap.docs.map((d) => Object.assign({ uid: d.id }, d.data()));
    if (!list.length) {
      referredBody.innerHTML = '<p class="hint">Bạn chưa giới thiệu giáo viên nào — dùng nút "Chia sẻ cho giáo viên khác" ở mục "Mã &amp; chia sẻ" để bắt đầu nhận hoa hồng.</p>';
      return;
    }
    const subs = await Promise.all(list.map((t) => getTeacherSubscription(t.uid)));
    referredBody.innerHTML = list.map((t, i) => `
      <div class="hint" style="padding:6px 0;border-top:1px solid var(--border);">
        ${escapeHtml(t.displayName || '(chưa đặt tên)')} · ${subs[i].tier === 'pro' ? 'Pro' : 'Miễn phí'}
      </div>
    `).join('');
  } catch (e) {
    referredBody.innerHTML = `<p class="hint">⚠️ ${escapeHtml(e.message)}</p>`;
  }
}
