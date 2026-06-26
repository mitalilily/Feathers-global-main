import React from 'react'
import ReactApexChart from 'react-apexcharts'
import { useColorModeValue } from '@chakra-ui/react'

const AreaChart = ({ categories = [], series = [] }) => {
  const textColor = useColorModeValue('gray.700', 'white')
  const textColorSecondary = useColorModeValue('gray.500', 'gray.400')
  const gridColor = useColorModeValue('gray.200', 'gray.700')

  const chartOptions = {
    chart: {
      type: 'area',
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: true, speed: 700 },
    },
    stroke: {
      curve: 'smooth',
      width: 3,
    },
    dataLabels: {
      enabled: false,
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
    fill: {
      type: 'gradient',
      gradient: {
        shade: 'dark',
        type: 'vertical',
        opacityFrom: 0.8,
        opacityTo: 0.15,
      },
    },
    tooltip: {
      theme: useColorModeValue('light', 'dark'),
    },
    legend: {
      position: 'bottom',
      labels: {
        colors: textColorSecondary,
      },
    },
    colors: ['#0EA5E9', '#14B8A6', '#8B5CF6', '#F97316'],
  }

  return <ReactApexChart options={chartOptions} series={series} type="area" width="100%" height="100%" />
}

export default AreaChart
