import { Chart as ChartJS, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js'

// Registered once, imported (side-effect only) by every component that
// renders a react-chartjs-2 <Line> chart. Chart.js v4 requires explicit
// element/plugin registration; only what this app's line charts actually
// use — no CategoryScale/Legend/bar or pie elements pulled in.
ChartJS.register(LinearScale, LineElement, PointElement, Tooltip)
