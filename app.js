const pages=[...document.querySelectorAll('.page')];
function go(id){pages.forEach(p=>p.classList.toggle('active',p.id===id));document.querySelectorAll('[data-go]').forEach(b=>b.classList.toggle('active',b.classList.contains('nav-item')&&b.dataset.go===id));window.scrollTo({top:0,behavior:'smooth'});}
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
document.getElementById('adminOpen').addEventListener('click',()=>go('admin'));
document.getElementById('joinForm').addEventListener('submit',e=>{e.preventDefault();alert('参加登録機能は共有データベース接続後に有効になります。現時点では登録されません。');});
