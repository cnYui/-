// 雷达图分析功能 - mobile-index.html 专用
// 用于展示旅行分身完成旅程后的契合度分析

// 显示雷达图分析
function showRadarAnalysis() {
    const modal = document.getElementById('radarAnalysisModal');
    modal.style.display = 'block';
    setTimeout(() => {
        modal.classList.add('show');
        drawRadarChart();
    }, 10);
}

// 关闭雷达图分析
function closeRadarAnalysis() {
    const modal = document.getElementById('radarAnalysisModal');
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
}

// 绘制雷达图
function drawRadarChart() {
    const canvas = document.getElementById('radarChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 80;
    
    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 数据：个性指标
    const labels = ['文艺', '探索', '美食', '社交', '安静'];
    const data = [85, 90, 80, 60, 40]; // 用户匹配度数据
    const maxValue = 100;
    
    // 绘制背景网格
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 2;
    for (let i = 1; i <= 5; i++) {
        drawPolygon(ctx, centerX, centerY, radius * (i / 5), labels.length, '#e0e0e0', false);
    }
    
    // 绘制轴线
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    for (let i = 0; i < labels.length; i++) {
        const angle = (Math.PI * 2 * i) / labels.length - Math.PI / 2;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(x, y);
        ctx.stroke();
        
        // 绘制标签
        ctx.fillStyle = '#333';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const labelX = centerX + Math.cos(angle) * (radius + 20);
        const labelY = centerY + Math.sin(angle) * (radius + 20);
        ctx.fillText(labels[i], labelX, labelY);
    }
    
    // 绘制数据区域
    ctx.fillStyle = 'rgba(0, 230, 118, 0.3)';
    ctx.strokeStyle = '#00E676';
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    for (let i = 0; i < data.length; i++) {
        const angle = (Math.PI * 2 * i) / data.length - Math.PI / 2;
        const value = (data[i] / maxValue) * radius;
        const x = centerX + Math.cos(angle) * value;
        const y = centerY + Math.sin(angle) * value;
        
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // 绘制数据点
    ctx.fillStyle = '#00E676';
    for (let i = 0; i < data.length; i++) {
        const angle = (Math.PI * 2 * i) / data.length - Math.PI / 2;
        const value = (data[i] / maxValue) * radius;
        const x = centerX + Math.cos(angle) * value;
        const y = centerY + Math.sin(angle) * value;
        
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

// 辅助函数：绘制多边形
function drawPolygon(ctx, centerX, centerY, radius, sides, color, fill) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
        const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.closePath();
    if (fill) {
        ctx.fillStyle = color;
        ctx.fill();
    } else {
        ctx.strokeStyle = color;
        ctx.stroke();
    }
}

window.showRadarAnalysis = showRadarAnalysis;
window.closeRadarAnalysis = closeRadarAnalysis;
