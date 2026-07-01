import React from 'react'
import ReactApexChart from 'react-apexcharts'
import { useColorModeValue } from '@chakra-ui/react'

const HeatmapChart = ({ series = [], categories = [] }) => {
  const textColor = useColorModeValue('gray.700', 'white')
  const textColorSecondary = useColorModeValue('gray.500', 'gray.400')
  const gridColor = useColorModeValue('gray.200', 'gray.700')

  const chartOptions = {
    chart: {
      type: 'heatmap',
      toolbar: { show: false },
      animations: { enabled: true, speed: 700 },
    },
    plotOptions: {
      heatmap: {
        radius: 8,
        enableShades: false,
        colorScale: {
          ranges: [
            { from: 0, to: 49, color: '#FDE68A', name: 'Low' },
            { from: 50, to: 74, color: '#FDBA74', name: 'Medium' },
            { from: 75, to: 89, color: '#60A5FA', name: 'Good' },
            { from: 90, to: 100, color: '#34D399', name: 'Excellent' },
          ],
        },
      },
    },
    dataLabels: {
      enabled: true,
      style: {
        colors: [textColor],
        fontSize: '11px',
        fontFamily: 'Inter, sans-serif',
        fontWeight: 700,
      },
    },
    xaxis: {
      categories,
      labels: {
        style: {
          colors: textColorSecondary,
          fontSize: '12px',
          fontFamily: 'Inter, sans-serif',
          fontWeight: 600,
        },
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        style: {
          colors: textColorSecondary,
          fontSize: '12px',
          fontFamily: 'Inter, sans-serif',
          fontWeight: 600,
        },
      },
    },
    grid: {
      borderColor: gridColor,
      strokeDashArray: 3,
    },
    tooltip: {
      theme: useColorModeValue('light', 'dark'),
      style: { fontSize: '12px', fontFamily: 'Inter, sans-serif' },
    },
    legend: {
      show: false,
    },
  }

  return <ReactApexChart options={chartOptions} series={series} type="heatmap" width="100%" height="100%" />
}

export default HeatmapChart
