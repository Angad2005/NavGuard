const loginTab=document.getElementById('loginTab');
const signupTab=document.getElementById('signupTab');
const loginForm=document.getElementById('loginForm');
const signupForm=document.getElementById('signupForm');
const message=document.getElementById('message');

function showMessage(text,type){
message.textContent=text;
message.className='msg '+type;
}

function clearMessage(){
message.textContent='';
message.className='msg';
}

function switchTab(mode){
clearMessage();

const isLogin=mode==='login';

loginTab.classList.toggle('active',isLogin);
signupTab.classList.toggle('active',!isLogin);

loginForm.classList.toggle('hidden',!isLogin);
signupForm.classList.toggle('hidden',isLogin);
}

loginTab.addEventListener('click',()=>switchTab('login'));

signupTab.addEventListener('click',()=>switchTab('signup'));

function getUsers(){
return JSON.parse(localStorage.getItem('rp_users')||'[]');
}

function saveUsers(users){
localStorage.setItem('rp_users',JSON.stringify(users));
}

signupForm.addEventListener('submit',e=>{
e.preventDefault();

const name=document.getElementById('signupName').value.trim();
const email=document.getElementById('signupEmail').value.trim().toLowerCase();
const password=document.getElementById('signupPassword').value;
const confirm=document.getElementById('confirmPassword').value;

if(password.length<6){
return showMessage('Password must be at least 6 characters.','error');
}

if(password!==confirm){
return showMessage('Passwords do not match.','error');
}

const users=getUsers();

if(users.some(u=>u.email===email)){
return showMessage('An account with this email already exists.','error');
}

users.push({
name,
email,
password
});

saveUsers(users);

showMessage('Account created! You can log in now.','success');

signupForm.reset();

setTimeout(()=>switchTab('login'),800);
});

loginForm.addEventListener('submit',e=>{
e.preventDefault();

const email=document.getElementById('loginEmail').value.trim().toLowerCase();
const password=document.getElementById('loginPassword').value;

const user=getUsers().find(
u=>u.email===email&&u.password===password
);

if(!user){
return showMessage('Invalid email or password.','error');
}

localStorage.setItem(
'rp_session',
JSON.stringify({
name:user.name,
email:user.email
})
);

setTimeout(()=>{
window.location.href='main.html';
},700);
});

document.getElementById('forgot').addEventListener('click',e=>{
e.preventDefault();

showMessage(
'Password reset is not available in this demo.',
'error'
);
});

document.getElementById('guestBtn').addEventListener('click',()=>{
localStorage.setItem(
'rp_session',
JSON.stringify({
name:'Guest',
email:'Browsing without an account',
guest:true
})
);

window.location.href='main.html';
});