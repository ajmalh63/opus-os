// Visual background movement animation for Opus OS
import { useEffect, useRef } from 'react';

export default function LiveWallpaper() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let animationFrameId: number;

    const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    let nodes: Node[] = [];

    class Node {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      isPulsing: boolean;
      pulsePhase: number;

      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.vx = (Math.random() - 0.5) * 0.6;
        this.vy = (Math.random() - 0.5) * 0.6;
        this.radius = Math.random() * 2.0 + 1.2; // 20%+ thicker
        this.isPulsing = Math.random() > 0.8;
        this.pulsePhase = Math.random() * Math.PI * 2;
      }

      update(mx: number, my: number) {
        this.x += this.vx;
        this.y += this.vy;

        // Force field effect (parallax/repel)
        const dx = mx - this.x;
        const dy = my - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) {
          const force = (150 - dist) / 150;
          this.x -= (dx / dist) * force * 1.5;
          this.y -= (dy / dist) * force * 1.5;
        }

        // Bounce off edges
        if (this.x < 0 || this.x > width) this.vx *= -1;
        if (this.y < 0 || this.y > height) this.vy *= -1;
        
        if (this.isPulsing) {
          this.pulsePhase += 0.04;
        }
      }

      draw(ctx: CanvasRenderingContext2D) {
        ctx.beginPath();
        let r = this.radius;
        if (this.isPulsing) {
          r += Math.sin(this.pulsePhase) * 0.5;
        }
        ctx.arc(this.x, this.y, Math.max(0.1, r), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(215, 160, 25, 0.65)'; // Brand Gold with low opacity
        ctx.fill();
      }
    }

    const init = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      
      // density based on screen size, cap at 70
      const nodeCount = Math.min(Math.floor((width * height) / 15000), 70);
      nodes = Array.from({ length: nodeCount }, () => new Node());
      
      // init mouse to center
      mouse.x = width / 2;
      mouse.y = height / 2;
      mouse.targetX = width / 2;
      mouse.targetY = height / 2;
    };

    const resizeHandler = () => init();
    window.addEventListener('resize', resizeHandler);

    const mouseMoveHandler = (e: MouseEvent) => {
      mouse.targetX = e.clientX;
      mouse.targetY = e.clientY;
    };
    window.addEventListener('mousemove', mouseMoveHandler);

    init();

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      
      // smooth mouse transition
      mouse.x += (mouse.targetX - mouse.x) * 0.05;
      mouse.y += (mouse.targetY - mouse.y) * 0.05;

      nodes.forEach((node) => {
        node.update(mouse.x, mouse.y);
        node.draw(ctx);
      });

      // draw connections (flight paths / document flows)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 140) {
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            // adding a slight curve to simulate flight paths
            const midX = (nodes[i].x + nodes[j].x) / 2;
            const midY = (nodes[i].y + nodes[j].y) / 2 - dist * 0.15;
            ctx.quadraticCurveTo(midX, midY, nodes[j].x, nodes[j].y);
            
            ctx.strokeStyle = `rgba(215, 160, 25, ${0.28 * (1 - dist / 140)})`;
            ctx.lineWidth = 1.5; // Thicker lines
            ctx.stroke();
          }
        }
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resizeHandler);
      window.removeEventListener('mousemove', mouseMoveHandler);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      aria-hidden="true"
    />
  );
}
