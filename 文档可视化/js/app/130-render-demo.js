/**
 * 渲染层 · renderDemo
 * 切片自：js/app.js 原 3603-3645 行
 *
 * 约定：渲染层跨 <script> 共享全局作用域（原外层 IIFE 已移除）。
 *   - 顶层 function / var 都是全局的，按 index.html 的顺序加载；
 *   - 真正的调用发生在 DOMContentLoaded（最后一个文件），故跨文件引用安全；
 *   - 改一个渲染块，只读/只改对应文件，不必读全量。
 *
 * 本文件是最后一块：含 renderDemo 与 DOMContentLoaded 启动。
 */
  function renderDemo() {
    var stage = $("#demo-body");
    if (!stage) return;
    var searchEl = $("#search-input");
    stage.innerHTML = "";
    var q = ((searchEl && searchEl.value) || "").trim();
    var k = q.toLowerCase();
    var view = pickerViewId();
    if (view === "brand") renderBrandView(stage, q, k);
    else if (view === "spec" || view === "standard" || view === "supplier") renderFlatSpecView(stage, q, k, view);
    else renderNameView(stage, q, k, view === "loose");
    if (state.moreFocus) {
      var inp = $(".pp-more-input");
      if (inp) {
        inp.focus();
        var v = inp.value || "";
        if (inp.setSelectionRange) inp.setSelectionRange(v.length, v.length);
      }
      state.moreFocus = false;
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    restoreNavState();
    applyGovernanceHead();
    renderNav();
    renderModuleShell();
    window.addEventListener("scroll", scheduleScrollPersist, { passive: true });
    window.addEventListener("pagehide", persistNavState);
    var searchEl = $("#search-input");
    if (searchEl) {
      searchEl.addEventListener("input", function () {
        if (state.module === "product-model" && state.chapter === "picker") renderDemo();
      });
    }
    $("#modal-close").addEventListener("click", closeModal);
    $("#modal-backdrop").addEventListener("click", closeModal);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });
  });


