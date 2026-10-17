const map=document.getElementById('map'),view=document.getElementById('view'),capture=document.getElementById('capture'),full=document.getElementById('full');
function update(){const url=`./${map.value}-${view.value}.png`;capture.src=url;full.href=url;capture.alt=`${map.selectedOptions[0].textContent}：${view.selectedOptions[0].textContent}`;}
map.addEventListener('change',update);view.addEventListener('change',update);
