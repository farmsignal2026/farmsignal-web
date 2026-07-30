import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js'

// Registered once, imported (side-effect only) by every component that
// renders a react-chartjs-2 <Line>/<Bar> chart. Chart.js v4 requires
// explicit element/plugin registration.
ChartJS.register(LinearScale, CategoryScale, LineElement, BarElement, PointElement, Tooltip, Legend)
